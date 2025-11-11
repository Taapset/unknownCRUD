from __future__ import annotations

from datetime import datetime
from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class SourceEdition(BaseModel):
    id: str
    lang: str
    type: str
    provenance: Optional[str] = None

    model_config = ConfigDict(extra="forbid")


class ReviewHistoryIssue(BaseModel):
    path: Optional[str] = None
    lang: Optional[str] = None
    problem: Optional[str] = None
    found: Optional[str] = None
    expected: Optional[str] = None
    suggestion: Optional[str] = None
    severity: Optional[str] = None

    model_config = ConfigDict(extra="forbid")


class ReviewHistoryEntry(BaseModel):
    ts: datetime
    actor: str
    action: str
    from_state: Optional[str] = Field(default=None, alias="from")
    to_state: Optional[str] = Field(default=None, alias="to")
    issues: List[ReviewHistoryIssue] = Field(default_factory=list)
    hash_before: Optional[str] = None
    hash_after: Optional[str] = None

    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class ReviewBlock(BaseModel):
    state: Literal[
        "draft", "review_pending", "approved", "locked", "rejected", "flagged"
    ] = "draft"
    required_reviewers: List[str] = Field(
        default_factory=lambda: ["editor", "linguist", "final"]
    )
    history: List[ReviewHistoryEntry] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")


class OriginEntry(BaseModel):
    edition: str
    page: Optional[int] = None
    para_index: Optional[int] = None

    model_config = ConfigDict(extra="forbid")


class Verse(BaseModel):
    type: Literal["verse"] = "verse"
    work_id: str
    verse_id: str
    number_manual: Optional[str] = None
    order: int
    number_generated: Optional[str] = None
    texts: Dict[str, Optional[str]]
    segments: Dict[str, List[str]] = Field(default_factory=dict)
    origin: List[OriginEntry] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)
    hash: Dict[str, Optional[str]] = Field(default_factory=dict)
    meta: Dict[str, Optional[str]] = Field(default_factory=dict)
    review: ReviewBlock = Field(default_factory=ReviewBlock)

    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class CommentaryTarget(BaseModel):
    kind: str
    ids: List[str]

    model_config = ConfigDict(extra="forbid")


class Commentary(BaseModel):
    type: Literal["commentary"] = "commentary"
    commentary_id: str
    work_id: str
    verse_id: Optional[str] = None
    targets: List[CommentaryTarget]
    speaker: Optional[str] = None
    source: Optional[str] = None
    date: Dict[str, Optional[str]] = Field(default_factory=dict)
    genre: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    texts: Dict[str, Optional[str]]
    authenticity: Dict[str, Optional[str | float]] = Field(default_factory=dict)
    priority: Dict[str, Optional[float]] = Field(default_factory=dict)
    review: ReviewBlock = Field(default_factory=lambda: ReviewBlock(state="review_pending"))

    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class Work(BaseModel):
    work_id: str
    title: Dict[str, Optional[str]]
    author: Optional[str] = None
    canonical_lang: str
    langs: List[str]
    structure: Dict[str, Optional[str]]
    source_editions: List[SourceEdition] = Field(default_factory=list)
    policy: Dict[str, Optional[str]] = Field(default_factory=dict)

    model_config = ConfigDict(extra="forbid")


class User(BaseModel):
    id: str
    email: str
    password_hash: str
    roles: List[str] = Field(default_factory=list)
    approved: bool = True
    twoFactorEnabled: bool = False

    model_config = ConfigDict(extra="forbid", populate_by_name=True)
