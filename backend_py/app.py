from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional

from fastapi import Cookie, Depends, FastAPI, HTTPException, Query, Response, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field

import storage
from models import (
    Commentary,
    OriginEntry,
    ReviewBlock,
    ReviewHistoryEntry,
    ReviewHistoryIssue,
    User,
    Verse,
    Work,
)


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    roles: List[str] = Field(default_factory=lambda: ["author"])


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    otp: Optional[str] = None


class AuthResponse(BaseModel):
    id: str
    email: EmailStr
    roles: List[str]
    twoFactorEnabled: bool = False


class WorkUpdateRequest(Work):
    pass


class VerseCreateRequest(BaseModel):
    number_manual: str
    texts: Dict[str, Optional[str]]
    origin: List[OriginEntry]
    tags: List[str] = Field(default_factory=list)
    segments: Optional[Dict[str, List[str]]] = None
    meta: Optional[Dict[str, Optional[str]]] = None


class VerseUpdateRequest(BaseModel):
    number_manual: Optional[str] = None
    texts: Optional[Dict[str, Optional[str]]] = None
    origin: Optional[List[OriginEntry]] = None
    tags: Optional[List[str]] = None
    segments: Optional[Dict[str, List[str]]] = None
    meta: Optional[Dict[str, Optional[str]]] = None
    review: Optional[Dict] = None


class CommentaryCreateRequest(BaseModel):
    texts: Dict[str, Optional[str]]
    speaker: Optional[str] = None
    source: Optional[str] = None
    genre: Optional[str] = None
    tags: List[str] = Field(default_factory=list)


class CommentaryUpdateRequest(BaseModel):
    texts: Optional[Dict[str, Optional[str]]] = None
    speaker: Optional[str] = None
    source: Optional[str] = None
    genre: Optional[str] = None
    tags: Optional[List[str]] = None
    review: Optional[Dict] = None


class ReviewRequest(BaseModel):
    work_id: str


class RejectRequest(ReviewRequest):
    issues: List[ReviewHistoryIssue] = Field(default_factory=list)


class ExportRequest(BaseModel):
    work_id: str


class ExportResponse(BaseModel):
    output: str


class ExportFormat(str, Enum):
    MERGED = "merged"
    CLEAN = "clean"


class AdminUserCreateRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    roles: List[str] = Field(default_factory=lambda: ["submitter"])
    enabled: bool = True


class AdminUserUpdateRequest(BaseModel):
    email: Optional[EmailStr] = None
    password: Optional[str] = Field(None, min_length=8)
    roles: Optional[List[str]] = None
    enabled: Optional[bool] = None


class AdminUserResponse(BaseModel):
    id: str
    email: EmailStr
    roles: List[str]
    enabled: bool = True
    created_at: Optional[str] = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)


class AnalyticsResponse(BaseModel):
    total_works: int
    total_verses: int
    total_commentary: int
    works_by_status: Dict[str, int]
    recent_activity: List[Dict[str, Any]]


class SMEAnalyticsResponse(BaseModel):
    pending_reviews: int
    approved_by_me: int
    rejected_by_me: int
    flagged_items: int
    my_recent_activity: List[Dict[str, Any]]
    work_progress: Dict[str, Dict[str, int]]


class BulkActionRequest(BaseModel):
    work_id: str
    verse_ids: List[str]
    action: str  # approve, reject, flag, rollback
    issues: List[ReviewHistoryIssue] = Field(default_factory=list)


class SegmentUpdateRequest(BaseModel):
    work_id: str
    verse_id: str
    segments: Dict[str, List[str]]


sessions: Dict[str, str] = {}
csrf_token = secrets.token_urlsafe(32)

ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "https://prabhati.org",
    "http://prabhati.org"
]
SESSION_COOKIE_NAME = "session_id"
SESSION_COOKIE_PARAMS = {
    "httponly": True,
    "secure": False,  # Use True when serving over HTTPS.
    "samesite": "lax",
    "path": "/",
    "max_age": 60 * 60 * 24,
}

LANG_FALLBACKS = ["bn", "en", "or", "hi", "as"]


def _expected_languages(work: Work) -> List[str]:
    languages: List[str] = []
    for lang in (work.langs or []):
        if lang not in languages:
            languages.append(lang)
    for lang in LANG_FALLBACKS:
        if lang not in languages:
            languages.append(lang)
    return languages


def _normalize_language_fields(work: Work, verse_dict: Dict[str, Any]) -> Dict[str, Any]:
    expected = _expected_languages(work)
    texts = verse_dict.get("texts") or {}
    segments = verse_dict.get("segments") or {}
    hashes = verse_dict.get("hash") or {}

    verse_dict["texts"] = {lang: texts.get(lang) for lang in expected}
    verse_dict["segments"] = {
        lang: list(segments.get(lang) or []) for lang in expected
    }
    verse_dict["hash"] = {lang: hashes.get(lang) for lang in expected}
    return verse_dict


def _normalize_verse_model(work: Work, verse: Verse) -> Verse:
    normalized = _normalize_language_fields(work, verse.dict(by_alias=True))
    return Verse.parse_obj(normalized)


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def serialize_user(user: User) -> AuthResponse:
    return AuthResponse(id=user.id, email=user.email, roles=user.roles, twoFactorEnabled=user.twoFactorEnabled)


def get_user_by_email(email: str) -> Optional[User]:
    for user in storage.load_users():
        if user.email.lower() == email.lower():
            return user
    return None


def save_user(user: User) -> None:
    users = storage.load_users()
    users.append(user)
    storage.save_users(users)


def update_user(user: User) -> None:
    users = storage.load_users()
    for idx, existing in enumerate(users):
        if existing.id == user.id:
            users[idx] = user
            break
    storage.save_users(users)


def delete_user_by_id(user_id: str) -> bool:
    users = storage.load_users()
    for idx, existing in enumerate(users):
        if existing.id == user_id:
            users.pop(idx)
            storage.save_users(users)
            return True
    return False


def get_user_by_id(user_id: str) -> Optional[User]:
    for user in storage.load_users():
        if user.id == user_id:
            return user
    return None


def is_admin(user: User) -> bool:
    return "platform_admin" in user.roles or "admin" in user.roles


def is_sme(user: User) -> bool:
    return "sme" in user.roles or is_admin(user)


def can_review(user: User) -> bool:
    return "reviewer" in user.roles or "sme" in user.roles or is_admin(user)


async def get_current_user(
    session_id: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME)
) -> User:
    if not session_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    user_id = sessions.get(session_id)
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session")
    for user in storage.load_users():
        if user.id == user_id:
            return user
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")


def create_app() -> FastAPI:
    app = FastAPI(title="Unknown CRUD Library API", version="v1")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    def health() -> Dict[str, str]:
        return {"status": "ok", "version": "v1"}

    @app.get("/auth/csrf")
    def get_csrf() -> Dict[str, str]:
        return {"csrfToken": csrf_token}

    @app.post("/auth/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
    def register(payload: RegisterRequest) -> AuthResponse:
        if get_user_by_email(payload.email):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User already exists")
        user = User(
            id=str(uuid.uuid4()),
            email=payload.email.lower(),
            password_hash=hash_password(payload.password),
            roles=payload.roles or ["author"],
            twoFactorEnabled=False,
        )
        save_user(user)
        return serialize_user(user)

    @app.post("/auth/login", response_model=AuthResponse)
    def login(payload: LoginRequest, response: Response) -> AuthResponse:
        user = get_user_by_email(payload.email)
        if not user or user.password_hash != hash_password(payload.password):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
        session_id = secrets.token_urlsafe(32)
        sessions[session_id] = user.id
        response.set_cookie(SESSION_COOKIE_NAME, session_id, **SESSION_COOKIE_PARAMS)
        return serialize_user(user)

    @app.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
    def logout(
        response: Response,
        session_id: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    ) -> Response:
        if session_id and session_id in sessions:
            sessions.pop(session_id)
        if response:
            response.delete_cookie(
                SESSION_COOKIE_NAME,
                path=SESSION_COOKIE_PARAMS.get("path", "/"),
                samesite=SESSION_COOKIE_PARAMS.get("samesite", "lax"),
            )
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @app.get("/me", response_model=AuthResponse)
    async def me(user: User = Depends(get_current_user)) -> AuthResponse:
        return serialize_user(user)

    # Admin endpoints
    @app.get("/admin/users", response_model=List[AdminUserResponse])
    async def list_users(user: User = Depends(get_current_user)) -> List[AdminUserResponse]:
        if not is_admin(user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
        users = storage.load_users()
        return [
            AdminUserResponse(
                id=u.id,
                email=u.email,
                roles=u.roles,
                enabled=True,  # Default since User model doesn't have enabled field
                created_at=None
            )
            for u in users
        ]

    @app.post("/admin/users", response_model=AdminUserResponse, status_code=status.HTTP_201_CREATED)
    async def create_user(payload: AdminUserCreateRequest, user: User = Depends(get_current_user)) -> AdminUserResponse:
        if not is_admin(user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
        if get_user_by_email(payload.email):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User already exists")
        new_user = User(
            id=str(uuid.uuid4()),
            email=payload.email.lower(),
            password_hash=hash_password(payload.password),
            roles=payload.roles,
            twoFactorEnabled=False,
        )
        save_user(new_user)
        return AdminUserResponse(
            id=new_user.id,
            email=new_user.email,
            roles=new_user.roles,
            enabled=payload.enabled,
            created_at=None
        )

    @app.put("/admin/users/{user_id}", response_model=AdminUserResponse)
    async def update_user_admin(
        user_id: str, 
        payload: AdminUserUpdateRequest, 
        user: User = Depends(get_current_user)
    ) -> AdminUserResponse:
        if not is_admin(user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
        target_user = get_user_by_id(user_id)
        if not target_user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        
        # Check for email conflicts
        if payload.email and payload.email.lower() != target_user.email.lower():
            if get_user_by_email(payload.email):
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already exists")
            target_user.email = payload.email.lower()
        
        if payload.password:
            target_user.password_hash = hash_password(payload.password)
        if payload.roles is not None:
            target_user.roles = payload.roles
        
        update_user(target_user)
        return AdminUserResponse(
            id=target_user.id,
            email=target_user.email,
            roles=target_user.roles,
            enabled=payload.enabled if payload.enabled is not None else True,
            created_at=None
        )

    @app.delete("/admin/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
    async def delete_user_admin(user_id: str, user: User = Depends(get_current_user)) -> Response:
        if not is_admin(user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
        if user_id == user.id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete your own account")
        if not delete_user_by_id(user_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @app.post("/admin/change-password", status_code=status.HTTP_204_NO_CONTENT)
    async def change_password(payload: ChangePasswordRequest, user: User = Depends(get_current_user)) -> Response:
        if not is_admin(user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
        if user.password_hash != hash_password(payload.current_password):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")
        user.password_hash = hash_password(payload.new_password)
        update_user(user)
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @app.get("/admin/analytics", response_model=AnalyticsResponse)
    async def get_analytics(user: User = Depends(get_current_user)) -> AnalyticsResponse:
        if not is_admin(user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
        
        work_ids = storage.list_work_ids()
        total_works = len(work_ids)
        total_verses = 0
        total_commentary = 0
        works_by_status = {"draft": 0, "submitted": 0, "approved": 0, "locked": 0}
        
        for work_id in work_ids:
            verses = storage.list_verses(work_id)
            commentaries = storage.list_commentary(work_id)
            total_verses += len(verses)
            total_commentary += len(commentaries)
            
            # Count verses by status
            for verse in verses:
                status = verse.review.state if verse.review else "draft"
                if status in works_by_status:
                    works_by_status[status] += 1
        
        # Recent activity (simplified)
        recent_activity = [
            {"type": "verse_created", "count": total_verses, "date": datetime.now().isoformat()},
            {"type": "commentary_added", "count": total_commentary, "date": datetime.now().isoformat()}
        ]
        
        return AnalyticsResponse(
            total_works=total_works,
            total_verses=total_verses,
            total_commentary=total_commentary,
            works_by_status=works_by_status,
            recent_activity=recent_activity
        )

    # Regular user endpoints
    @app.get("/works")
    def list_works() -> List[Dict]:
        work_summaries: List[Dict] = []
        for work_id in storage.list_work_ids():
            work = storage.load_work(work_id)
            work_summaries.append(
                {
                    "work_id": work.work_id,
                    "title": work.title,
                    "langs": work.langs,
                }
            )
        return work_summaries

    @app.get("/works/{work_id}", response_model=Work)
    def get_work(work_id: str) -> Work:
        try:
            return storage.load_work(work_id)
        except FileNotFoundError:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Work not found")

    @app.post("/works", response_model=Work, status_code=status.HTTP_201_CREATED)
    async def create_work(payload: WorkUpdateRequest, user: User = Depends(get_current_user)) -> Work:
        if not is_sme(user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="SME access required")
        
        # Check if work already exists
        try:
            storage.load_work(payload.work_id)
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Work already exists")
        except FileNotFoundError:
            pass  # Work doesn't exist, which is what we want
        
        storage.save_work(payload)
        return payload

    @app.put("/works/{work_id}", response_model=Work)
    async def update_work(work_id: str, payload: WorkUpdateRequest, user: User = Depends(get_current_user)) -> Work:
        if not is_sme(user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="SME access required")
        if payload.work_id != work_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Mismatched work_id")
        storage.save_work(payload)
        return payload

    @app.delete("/works/{work_id}", status_code=status.HTTP_204_NO_CONTENT)
    async def delete_work(work_id: str, user: User = Depends(get_current_user)) -> Response:
        if not is_sme(user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="SME access required")
        try:
            storage.delete_work(work_id)
        except FileNotFoundError:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Work not found")
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @app.get("/works/{work_id}/verses")
    def list_verses(
        work_id: str,
        offset: int = Query(0, ge=0),
        limit: int = Query(20, ge=1, le=100),
    ) -> Dict[str, object]:
        try:
            work = storage.load_work(work_id)
        except FileNotFoundError:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Work not found")
        verses = [_normalize_verse_model(work, verse) for verse in storage.list_verses(work_id)]
        total = len(verses)
        slice_end = min(offset + limit, total)
        items = [verse.dict(by_alias=True) for verse in verses[offset:slice_end]]
        next_offset = slice_end if slice_end < total else None
        next_cursor = {"offset": next_offset, "limit": limit} if next_offset is not None else None
        return {"items": items, "next": next_cursor, "total": total}

    @app.get("/works/{work_id}/verses/{verse_id}", response_model=Verse)
    def get_verse(work_id: str, verse_id: str) -> Verse:
        try:
            work = storage.load_work(work_id)
            verse = storage.load_verse(work_id, verse_id)
            return _normalize_verse_model(work, verse)
        except FileNotFoundError:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Verse not found")

    @app.post("/works/{work_id}/verses", status_code=status.HTTP_201_CREATED)
    async def create_verse(
        work_id: str,
        payload: VerseCreateRequest,
        user: User = Depends(get_current_user),
    ) -> Dict[str, str]:
        try:
            work = storage.load_work(work_id)
        except FileNotFoundError:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Work not found")
        if storage.manual_number_exists(work_id, payload.number_manual):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="duplicate manual number",
            )
        verse_id, order = storage.generate_verse_id(work_id)
        expected_langs = _expected_languages(work)
        incoming_texts = payload.texts or {}
        normalized_texts = {lang: incoming_texts.get(lang) for lang in expected_langs}
        segments_payload = payload.segments or {}
        normalized_segments = {lang: list(segments_payload.get(lang) or []) for lang in expected_langs}
        meta = payload.meta or {}
        meta.setdefault("entered_by", user.email)
        verse = Verse(
            work_id=work_id,
            verse_id=verse_id,
            number_manual=payload.number_manual,
            order=order,
            texts=normalized_texts,
            segments=normalized_segments,
            origin=[entry.dict(by_alias=True) for entry in payload.origin],
            tags=payload.tags,
            review=ReviewBlock(),
            meta=meta,
            hash={lang: None for lang in expected_langs},
        )
        verse = _normalize_verse_model(work, verse)
        storage.save_verse(verse)
        return {"verse_id": verse_id, "location": f"/works/{work_id}/verses/{verse_id}"}

    @app.put("/works/{work_id}/verses/{verse_id}", response_model=Verse)
    async def update_verse(
        work_id: str,
        verse_id: str,
        payload: VerseUpdateRequest,
        user: User = Depends(get_current_user),
    ) -> Verse:
        try:
            work = storage.load_work(work_id)
        except FileNotFoundError:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Work not found")
        try:
            verse = storage.load_verse(work_id, verse_id)
        except FileNotFoundError:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Verse not found")
        data = verse.dict(by_alias=True)
        if payload.number_manual is not None and payload.number_manual != verse.number_manual:
            if storage.manual_number_exists(work_id, payload.number_manual, exclude=verse_id):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="duplicate manual number",
                )
            data["number_manual"] = payload.number_manual
        if payload.texts is not None:
            data["texts"] = payload.texts
        if payload.origin is not None:
            data["origin"] = [entry.dict(by_alias=True) for entry in payload.origin]
        if payload.tags is not None:
            data["tags"] = payload.tags
        if payload.segments is not None:
            data["segments"] = payload.segments
        if payload.meta is not None:
            meta = data.get("meta", {})
            meta.update(payload.meta)
            data["meta"] = meta
        data = _normalize_language_fields(work, data)
        updated = Verse.parse_obj(data)
        updated = _normalize_verse_model(work, updated)
        storage.save_verse(updated)
        return updated

    @app.delete("/works/{work_id}/verses/{verse_id}", status_code=status.HTTP_204_NO_CONTENT)
    async def delete_verse(work_id: str, verse_id: str, user: User = Depends(get_current_user)) -> Response:
        storage.delete_verse(work_id, verse_id, actor=user.email)
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @app.get("/works/{work_id}/commentary/{commentary_id}", response_model=Commentary)
    def get_commentary(work_id: str, commentary_id: str) -> Commentary:
        try:
            return storage.load_commentary(work_id, commentary_id)
        except FileNotFoundError:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Commentary not found")

    @app.get("/works/{work_id}/verses/{verse_id}/commentary", response_model=List[Commentary])
    def list_commentary_for_verse(work_id: str, verse_id: str) -> List[Commentary]:
        try:
            storage.load_verse(work_id, verse_id)
        except FileNotFoundError:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Verse not found")
        commentaries = storage.list_commentary_for_verse(work_id, verse_id)
        return [commentary for commentary in commentaries]

    @app.post("/works/{work_id}/verses/{verse_id}/commentary", status_code=status.HTTP_201_CREATED)
    async def create_commentary(
        work_id: str,
        verse_id: str,
        payload: CommentaryCreateRequest,
        user: User = Depends(get_current_user),
    ) -> Dict[str, str]:
        try:
            storage.load_verse(work_id, verse_id)
        except FileNotFoundError:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Verse not found")
        commentary_id = storage.generate_commentary_id(work_id, verse_id)
        commentary = Commentary(
            work_id=work_id,
            verse_id=verse_id,
            commentary_id=commentary_id,
            targets=[{"kind": "verse", "ids": [verse_id]}],
            speaker=payload.speaker,
            source=payload.source,
            genre=payload.genre,
            tags=payload.tags,
            texts=payload.texts,
            authenticity={"status": "attested", "confidence": 1.0},
            priority={"lineage_bias": 1.0},
        )
        storage.save_commentary(commentary)
        return {"commentary_id": commentary_id}

    @app.put("/works/{work_id}/commentary/{commentary_id}", response_model=Commentary)
    async def update_commentary(
        work_id: str,
        commentary_id: str,
        payload: CommentaryUpdateRequest,
        user: User = Depends(get_current_user),
    ) -> Commentary:
        commentary = storage.load_commentary(work_id, commentary_id)
        data = commentary.dict(by_alias=True)
        if payload.texts is not None:
            data["texts"] = payload.texts
        if payload.speaker is not None:
            data["speaker"] = payload.speaker
        if payload.source is not None:
            data["source"] = payload.source
        if payload.genre is not None:
            data["genre"] = payload.genre
        if payload.tags is not None:
            data["tags"] = payload.tags
        updated = Commentary.parse_obj(data)
        storage.save_commentary(updated)
        return updated

    @app.delete("/works/{work_id}/commentary/{commentary_id}", status_code=status.HTTP_204_NO_CONTENT)
    async def delete_commentary(work_id: str, commentary_id: str, user: User = Depends(get_current_user)) -> Response:
        storage.delete_commentary(work_id, commentary_id, actor=user.email)
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    def _transition_review(
        review: ReviewBlock,
        new_state: str,
        actor: str,
        action: str,
        issues: Optional[List[ReviewHistoryIssue]] = None,
    ) -> ReviewHistoryEntry:
        entry = ReviewHistoryEntry(
            ts=datetime.now(timezone.utc),
            actor=actor,
            action=action,
            **{"from": review.state, "to": new_state},
            issues=issues or [],
            hash_before=None,
            hash_after=None,
        )
        review.history.append(entry)
        review.state = new_state
        return entry

    def _serialize_history_entry(entry: ReviewHistoryEntry) -> Dict[str, object]:
        data = entry.dict(by_alias=True)
        data["ts"] = entry.ts.isoformat()
        data["issues"] = [issue.dict(by_alias=True) for issue in entry.issues]
        return data

    def _validate_ready_for_approval(work: Work, verse: Verse) -> None:
        canonical_lang = work.canonical_lang
        canonical_text = verse.texts.get(canonical_lang)
        if not canonical_text:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Canonical language text required")
        if not verse.origin:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Origin entry required")

    @app.post("/review/verse/{verse_id}/approve", response_model=Verse)
    async def approve_verse(
        verse_id: str,
        payload: ReviewRequest,
        user: User = Depends(get_current_user),
    ) -> Verse:
        verse = storage.load_verse(payload.work_id, verse_id)
        work = storage.load_work(payload.work_id)
        _validate_ready_for_approval(work, verse)
        entry = _transition_review(verse.review, "approved", user.email, "state_change")
        verse = _normalize_verse_model(work, verse)
        storage.save_verse(verse)
        storage.append_review_log("verse", payload.work_id, verse_id, _serialize_history_entry(entry))
        return verse

    @app.post("/review/verse/{verse_id}/reject", response_model=Verse)
    async def reject_verse(
        verse_id: str,
        payload: RejectRequest,
        user: User = Depends(get_current_user),
    ) -> Verse:
        verse = storage.load_verse(payload.work_id, verse_id)
        work = storage.load_work(payload.work_id)
        issues = payload.issues or []
        entry = _transition_review(verse.review, "rejected", user.email, "issue_add", issues=issues)
        verse = _normalize_verse_model(work, verse)
        storage.save_verse(verse)
        storage.append_review_log("verse", payload.work_id, verse_id, _serialize_history_entry(entry))
        return verse

    @app.post("/review/verse/{verse_id}/flag", response_model=Verse)
    async def flag_verse(
        verse_id: str,
        payload: ReviewRequest,
        user: User = Depends(get_current_user),
    ) -> Verse:
        verse = storage.load_verse(payload.work_id, verse_id)
        work = storage.load_work(payload.work_id)
        entry = _transition_review(verse.review, "flagged", user.email, "flag")
        verse = _normalize_verse_model(work, verse)
        storage.save_verse(verse)
        storage.append_review_log("verse", payload.work_id, verse_id, _serialize_history_entry(entry))
        return verse

    @app.post("/review/verse/{verse_id}/lock", response_model=Verse)
    async def lock_verse(
        verse_id: str,
        payload: ReviewRequest,
        user: User = Depends(get_current_user),
    ) -> Verse:
        verse = storage.load_verse(payload.work_id, verse_id)
        work = storage.load_work(payload.work_id)
        entry = _transition_review(verse.review, "locked", user.email, "lock")
        verse = _normalize_verse_model(work, verse)
        storage.save_verse(verse)
        storage.append_review_log("verse", payload.work_id, verse_id, _serialize_history_entry(entry))
        return verse

    @app.post("/review/commentary/{commentary_id}/approve", response_model=Commentary)
    async def approve_commentary(
        commentary_id: str,
        payload: ReviewRequest,
        user: User = Depends(get_current_user),
    ) -> Commentary:
        commentary = storage.load_commentary(payload.work_id, commentary_id)
        entry = _transition_review(commentary.review, "approved", user.email, "state_change")
        storage.save_commentary(commentary)
        storage.append_review_log("commentary", payload.work_id, commentary_id, _serialize_history_entry(entry))
        return commentary

    @app.post("/review/commentary/{commentary_id}/reject", response_model=Commentary)
    async def reject_commentary(
        commentary_id: str,
        payload: RejectRequest,
        user: User = Depends(get_current_user),
    ) -> Commentary:
        commentary = storage.load_commentary(payload.work_id, commentary_id)
        entry = _transition_review(commentary.review, "rejected", user.email, "issue_add", issues=payload.issues)
        storage.save_commentary(commentary)
        storage.append_review_log("commentary", payload.work_id, commentary_id, _serialize_history_entry(entry))
        return commentary

    @app.post("/review/commentary/{commentary_id}/flag", response_model=Commentary)
    async def flag_commentary(
        commentary_id: str,
        payload: ReviewRequest,
        user: User = Depends(get_current_user),
    ) -> Commentary:
        commentary = storage.load_commentary(payload.work_id, commentary_id)
        entry = _transition_review(commentary.review, "flagged", user.email, "flag")
        storage.save_commentary(commentary)
        storage.append_review_log("commentary", payload.work_id, commentary_id, _serialize_history_entry(entry))
        return commentary

    @app.post("/review/commentary/{commentary_id}/lock", response_model=Commentary)
    async def lock_commentary(
        commentary_id: str,
        payload: ReviewRequest,
        user: User = Depends(get_current_user),
    ) -> Commentary:
        commentary = storage.load_commentary(payload.work_id, commentary_id)
        entry = _transition_review(commentary.review, "locked", user.email, "lock")
        storage.save_commentary(commentary)
        storage.append_review_log("commentary", payload.work_id, commentary_id, _serialize_history_entry(entry))
        return commentary

    def _merge_payload(work_id: str) -> Dict[str, object]:
        work = storage.load_work(work_id)
        verses = [verse.dict(by_alias=True) for verse in storage.list_verses(work_id)]
        commentary = [item.dict(by_alias=True) for item in storage.list_commentary(work_id)]
        return {"work": work.dict(by_alias=True), "verses": verses, "commentary": commentary}

    def _write_output(path: str, payload) -> str:
        from pathlib import Path
        path_obj = Path(path)
        path_obj.parent.mkdir(parents=True, exist_ok=True)
        if path_obj.suffix == ".jsonl":
            with path_obj.open("w", encoding="utf-8") as handle:
                for line in payload:
                    handle.write(line)
                    handle.write("\n")
        else:
            import json
            with path_obj.open("w", encoding="utf-8") as handle:
                json.dump(payload, handle, ensure_ascii=False, indent=2)
        return str(path_obj)

    def _clean_payload(payload: Dict[str, object]) -> Dict[str, object]:
        import copy

        cleaned = copy.deepcopy(payload)
        for verse in cleaned.get("verses", []):
            verse.pop("review", None)
            meta = verse.get("meta") or {}
            for key in ["reviewer", "date_reviewed", "entered_by"]:
                if key in meta:
                    meta.pop(key)
            verse["meta"] = meta
            if "history" in verse:
                verse.pop("history")
        for item in cleaned.get("commentary", []):
            item.pop("review", None)
            item.pop("priority", None)
            item.pop("authenticity", None)
        return cleaned

    def _training_lines(payload: Dict[str, object]) -> List[str]:
        import json

        lines: List[str] = []
        work_id = payload["work"]["work_id"]
        for verse in payload.get("verses", []):
            verse_id = verse["verse_id"]
            tags = verse.get("tags") or []
            texts = verse.get("texts") or {}
            for lang, text in texts.items():
                if text:
                    lines.append(
                        json.dumps(
                            {
                                "type": "verse",
                                "work_id": work_id,
                                "verse_id": verse_id,
                                "lang": lang,
                                "text": text,
                                "tags": tags,
                            },
                            ensure_ascii=False,
                        )
                    )
        for commentary in payload.get("commentary", []):
            texts = commentary.get("texts") or {}
            for lang, text in texts.items():
                if text:
                    lines.append(
                        json.dumps(
                            {
                                "type": "commentary",
                                "work_id": work_id,
                                "commentary_id": commentary["commentary_id"],
                                "lang": lang,
                                "text": text,
                                "genre": commentary.get("genre"),
                            },
                            ensure_ascii=False,
                        )
                    )
        return lines

    def _clean_verse_bundle(work: Work, verse: Verse, commentary: List[Commentary]) -> Dict[str, Any]:
        base_payload = {
            "work": work.dict(by_alias=True),
            "verses": [verse.dict(by_alias=True)],
            "commentary": [item.dict(by_alias=True) for item in commentary],
        }
        cleaned = _clean_payload(base_payload)
        verses = cleaned.get("verses", [])
        verse_payload = verses[0] if verses else {}
        return {
            "work": cleaned.get("work", {}),
            "verse": verse_payload,
            "commentary": cleaned.get("commentary", []),
        }

    def _clean_full_library() -> List[Dict[str, Any]]:
        payloads: List[Dict[str, Any]] = []
        for wid in storage.list_work_ids():
            try:
                merged = _merge_payload(wid)
                cleaned = _clean_payload(merged)
                payloads.append(cleaned)
            except FileNotFoundError:
                continue
        return payloads

    @app.post("/build/merge", response_model=ExportResponse)
    async def build_merge(
        payload: ExportRequest,
        user: User = Depends(get_current_user),
    ) -> ExportResponse:
        merged = _merge_payload(payload.work_id)
        path = storage.work_dir(payload.work_id) / "build" / f"{payload.work_id}.all.json"
        _write_output(str(path), merged)
        return ExportResponse(output=str(path))

    @app.post("/export/clean", response_model=ExportResponse)
    async def export_clean(
        payload: ExportRequest,
        user: User = Depends(get_current_user),
    ) -> ExportResponse:
        merged = _merge_payload(payload.work_id)
        cleaned = _clean_payload(merged)
        path = storage.work_dir(payload.work_id) / "export" / f"{payload.work_id}.clean.json"
        _write_output(str(path), cleaned)
        return ExportResponse(output=str(path))

    @app.post("/export/train", response_model=ExportResponse)
    async def export_train(
        payload: ExportRequest,
        user: User = Depends(get_current_user),
    ) -> ExportResponse:
        merged = _merge_payload(payload.work_id)
        lines = _training_lines(merged)
        path = storage.work_dir(payload.work_id) / "export" / f"{payload.work_id}.train.jsonl"
        _write_output(str(path), lines)
        return ExportResponse(output=str(path))

    @app.get("/sme/export/work/{work_id}")
    async def sme_export_work(
        work_id: str,
        format: ExportFormat = ExportFormat.CLEAN,
        user: User = Depends(get_current_user),
    ) -> Dict[str, Any]:
        if not is_sme(user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="SME access required")
        try:
            payload = _merge_payload(work_id)
        except FileNotFoundError:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Work not found")
        if format == ExportFormat.CLEAN:
            payload = _clean_payload(payload)
        return payload

    @app.get("/sme/export/work/{work_id}/verse/{verse_id}")
    async def sme_export_verse(
        work_id: str,
        verse_id: str,
        format: ExportFormat = ExportFormat.CLEAN,
        user: User = Depends(get_current_user),
    ) -> Dict[str, Any]:
        if not is_sme(user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="SME access required")
        try:
            work = storage.load_work(work_id)
            verse = storage.load_verse(work_id, verse_id)
        except FileNotFoundError:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Work or verse not found")
        commentary_items = storage.list_commentary_for_verse(work_id, verse_id)
        if format == ExportFormat.CLEAN:
            return _clean_verse_bundle(work, verse, commentary_items)
        return {
            "work": work.dict(by_alias=True),
            "verse": verse.dict(by_alias=True),
            "commentary": [item.dict(by_alias=True) for item in commentary_items],
        }

    @app.get("/sme/export/all")
    async def sme_export_all(
        format: ExportFormat = ExportFormat.CLEAN,
        user: User = Depends(get_current_user),
    ) -> Dict[str, Any]:
        if not is_sme(user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="SME access required")
        if format == ExportFormat.CLEAN:
            payloads = _clean_full_library()
        else:
            payloads = []
            for wid in storage.list_work_ids():
                try:
                    payloads.append(_merge_payload(wid))
                except FileNotFoundError:
                    continue
        return {"works": payloads}

    # SME Dashboard endpoints
    @app.get("/sme/analytics", response_model=SMEAnalyticsResponse)
    async def get_sme_analytics(user: User = Depends(get_current_user)) -> SMEAnalyticsResponse:
        if not is_sme(user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="SME access required")
        
        work_ids = storage.list_work_ids()
        pending_reviews = 0
        approved_by_me = 0
        rejected_by_me = 0
        flagged_items = 0
        work_progress = {}
        my_recent_activity = []
        
        for work_id in work_ids:
            verses = storage.list_verses(work_id)
            work_stats = {"draft": 0, "review_pending": 0, "approved": 0, "rejected": 0, "flagged": 0}
            
            for verse in verses:
                state = verse.review.state if verse.review else "draft"
                if state in work_stats:
                    work_stats[state] += 1
                
                if state in ["review_pending", "flagged"]:
                    pending_reviews += 1
                if state == "flagged":
                    flagged_items += 1
                
                # Check if user was involved in review
                if verse.review and verse.review.history:
                    for entry in verse.review.history:
                        if entry.actor == user.email:
                            if entry.action == "state_change" and entry.to_state == "approved":
                                approved_by_me += 1
                            elif entry.action in ["issue_add", "state_change"] and entry.to_state == "rejected":
                                rejected_by_me += 1
                            
                            my_recent_activity.append({
                                "type": f"verse_{entry.action}",
                                "work_id": work_id,
                                "verse_id": verse.verse_id,
                                "action": entry.action,
                                "date": entry.ts.isoformat() if hasattr(entry.ts, 'isoformat') else str(entry.ts)
                            })
            
            work_progress[work_id] = work_stats
        
        # Sort recent activity by date
        my_recent_activity.sort(key=lambda x: x["date"], reverse=True)
        my_recent_activity = my_recent_activity[:20]  # Limit to 20 recent items
        
        return SMEAnalyticsResponse(
            pending_reviews=pending_reviews,
            approved_by_me=approved_by_me,
            rejected_by_me=rejected_by_me,
            flagged_items=flagged_items,
            my_recent_activity=my_recent_activity,
            work_progress=work_progress
        )

    @app.get("/sme/pending-reviews")
    async def get_pending_reviews(
        user: User = Depends(get_current_user),
        work_id: Optional[str] = Query(None),
        limit: int = Query(50, ge=1, le=100)
    ) -> Dict[str, Any]:
        if not is_sme(user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="SME access required")
        
        pending_items = []
        work_ids = [work_id] if work_id else storage.list_work_ids()
        
        for wid in work_ids:
            try:
                work = storage.load_work(wid)
                verses = storage.list_verses(wid)
                
                for verse in verses:
                    if verse.review and verse.review.state in ["review_pending", "flagged", "draft"]:
                        pending_items.append({
                            "type": "verse",
                            "work_id": wid,
                            "work_title": work.title,
                            "item_id": verse.verse_id,
                            "number_manual": verse.number_manual,
                            "state": verse.review.state,
                            "texts": verse.texts,
                            "tags": verse.tags,
                            "last_updated": verse.review.history[-1].ts.isoformat() if verse.review.history else None
                        })
                
                commentaries = storage.list_commentary(wid)
                for commentary in commentaries:
                    if commentary.review and commentary.review.state in ["review_pending", "flagged", "draft"]:
                        pending_items.append({
                            "type": "commentary",
                            "work_id": wid,
                            "work_title": work.title,
                            "item_id": commentary.commentary_id,
                            "verse_id": commentary.verse_id,
                            "state": commentary.review.state,
                            "texts": commentary.texts,
                            "speaker": commentary.speaker,
                            "last_updated": commentary.review.history[-1].ts.isoformat() if commentary.review.history else None
                        })
            except FileNotFoundError:
                continue
        
        # Sort by last updated
        pending_items.sort(key=lambda x: x.get("last_updated", ""), reverse=True)
        
        return {
            "items": pending_items[:limit],
            "total": len(pending_items)
        }

    @app.post("/sme/bulk-action")
    async def sme_bulk_action(
        payload: BulkActionRequest,
        user: User = Depends(get_current_user)
    ) -> Dict[str, Any]:
        if not is_sme(user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="SME access required")
        
        try:
            work = storage.load_work(payload.work_id)
        except FileNotFoundError:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Work not found")
        
        results = {"success": [], "failed": []}
        
        for verse_id in payload.verse_ids:
            try:
                verse = storage.load_verse(payload.work_id, verse_id)
                
                if payload.action == "approve":
                    _validate_ready_for_approval(work, verse)
                    entry = _transition_review(verse.review, "approved", user.email, "state_change")
                elif payload.action == "reject":
                    entry = _transition_review(verse.review, "rejected", user.email, "issue_add", issues=payload.issues)
                elif payload.action == "flag":
                    entry = _transition_review(verse.review, "flagged", user.email, "flag")
                elif payload.action == "rollback":
                    # Rollback to previous state
                    if verse.review.history:
                        prev_state = "draft"
                        for hist_entry in reversed(verse.review.history[:-1]):
                            if hist_entry.from_state:
                                prev_state = hist_entry.from_state
                                break
                        entry = _transition_review(verse.review, prev_state, user.email, "rollback")
                    else:
                        entry = _transition_review(verse.review, "draft", user.email, "rollback")
                else:
                    results["failed"].append({"verse_id": verse_id, "error": "Invalid action"})
                    continue
                
                verse = _normalize_verse_model(work, verse)
                storage.save_verse(verse)
                storage.append_review_log("verse", payload.work_id, verse_id, _serialize_history_entry(entry))
                results["success"].append(verse_id)
                
            except Exception as e:
                results["failed"].append({"verse_id": verse_id, "error": str(e)})
        
        return results

    @app.put("/sme/segments")
    async def update_segments(
        payload: SegmentUpdateRequest,
        user: User = Depends(get_current_user)
    ) -> Verse:
        if not is_sme(user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="SME access required")
        
        try:
            work = storage.load_work(payload.work_id)
            verse = storage.load_verse(payload.work_id, payload.verse_id)
        except FileNotFoundError:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Work or verse not found")
        
        # Update segments
        verse.segments = payload.segments
        
        # Add history entry for segment update
        entry = ReviewHistoryEntry(
            ts=datetime.now(timezone.utc),
            actor=user.email,
            action="segment_update",
            **{"from": verse.review.state, "to": verse.review.state},
            issues=[],
            hash_before=None,
            hash_after=None,
        )
        verse.review.history.append(entry)
        
        verse = _normalize_verse_model(work, verse)
        storage.save_verse(verse)
        storage.append_review_log("verse", payload.work_id, payload.verse_id, _serialize_history_entry(entry))
        
        return verse

    @app.get("/sme/work-summary/{work_id}")
    async def get_work_summary_for_sme(
        work_id: str,
        user: User = Depends(get_current_user)
    ) -> Dict[str, Any]:
        if not is_sme(user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="SME access required")
        
        try:
            work = storage.load_work(work_id)
            verses = storage.list_verses(work_id)
            commentaries = storage.list_commentary(work_id)
        except FileNotFoundError:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Work not found")
        
        # Calculate statistics
        verse_stats = {"draft": 0, "review_pending": 0, "approved": 0, "rejected": 0, "flagged": 0, "locked": 0}
        commentary_stats = {"draft": 0, "review_pending": 0, "approved": 0, "rejected": 0, "flagged": 0, "locked": 0}
        
        for verse in verses:
            state = verse.review.state if verse.review else "draft"
            if state in verse_stats:
                verse_stats[state] += 1
        
        for commentary in commentaries:
            state = commentary.review.state if commentary.review else "draft"
            if state in commentary_stats:
                commentary_stats[state] += 1
        
        return {
            "work": work.dict(by_alias=True),
            "verse_stats": verse_stats,
            "commentary_stats": commentary_stats,
            "total_verses": len(verses),
            "total_commentary": len(commentaries)
        }

    return app


app = create_app()
