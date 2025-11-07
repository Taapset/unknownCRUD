# SME Dashboard - Complete Functionality Guide

## Overview
The SME (Subject Matter Expert) Dashboard is a comprehensive management interface that provides SMEs with advanced tools for content review, book management, verse editing, and workflow control.

## Access
- **URL**: `/sme` (similar to admin panel at `/admin`)
- **Permissions**: Users with `sme`, `platform_admin`, or `admin` roles
- **Authentication**: Automatic based on user roles

## Core Features

### 1. Overview Tab
**Analytics & Metrics**
- Pending reviews count
- Items approved/rejected by current SME
- Flagged items requiring attention
- Work progress breakdown by status
- Recent activity timeline
- Performance metrics across all works

### 2. Pending Reviews Tab
**Review Queue Management**
- Filter by specific work or view all works
- Real-time list of items needing review
- Quick action buttons (Approve, Flag, Reject)
- Content preview with status indicators
- Batch selection capabilities
- Priority sorting by last updated

### 3. Work Management Tab
**Work-Level Operations**
- Select and analyze specific works
- Detailed work information display
- Verse and commentary statistics
- Status distribution charts
- Progress tracking per work
- Language coverage analysis

### 4. Bulk Actions Tab
**Mass Operations**
- Select multiple verses for batch processing
- Bulk approve/reject/flag operations
- Rollback functionality for corrections
- Issue tracking and comments
- Work-specific filtering
- Progress indicators for bulk operations

### 5. Book Management Tab
**Complete Book Lifecycle**
- Create new books/works
- Configure languages and metadata
- Add verses with multi-language support
- Edit existing content
- Manage book structure
- Source edition tracking

### 6. Data Export Tab
**Downloadable JSON Exports**
- Export a selected book in the clean JSON format
- Retrieve verse-level bundles including commentary for spot verification
- Generate a full-library clean export for archival or downstream processing
- Automatic filename timestamps for traceability
- Mirrors the `/export/clean` schema by removing review metadata

## Detailed Functionality

### Verse Management
**Advanced Editing Capabilities**
- **Content Tab**: Multi-language text editing, tag management
- **Segments Tab**: Break text into smaller segments for analysis
- **Review Tab**: Execute review actions with issue tracking
- **History Tab**: Complete audit trail of all changes

**Review Actions Available**
- **Approve**: Mark content as approved and ready
- **Reject**: Send back with specific issues/comments
- **Flag**: Mark for special attention or follow-up
- **Lock**: Prevent further modifications
- **Rollback**: Revert to previous state

### Book Creation Workflow
1. **Basic Information**
   - Work ID (unique identifier)
   - Title in multiple languages
   - Author information
   - Canonical language selection

2. **Language Configuration**
   - Select supported languages
   - Set primary/canonical language
   - Configure translation requirements

3. **Structure Setup**
   - Source editions tracking
   - Reference system configuration
   - Metadata schema definition

### Segment Management
**Text Segmentation Features**
- Break verses into smaller meaningful units
- Language-specific segment alignment
- Translation coordination
- Analysis preparation
- Quality assurance support

### Review Workflow
**Multi-Stage Review Process**
1. **Draft**: Initial content creation
2. **Review Pending**: Submitted for SME review
3. **Approved**: SME approved content
4. **Rejected**: Returned with issues
5. **Flagged**: Marked for special attention
6. **Locked**: Finalized and protected

### Analytics & Reporting
**Comprehensive Metrics**
- Work completion percentages
- Review velocity tracking
- Quality metrics
- User activity monitoring
- Issue trend analysis
- Performance benchmarking

## API Endpoints

### SME-Specific Endpoints
- `GET /sme/analytics` - SME dashboard analytics
- `GET /sme/pending-reviews` - Pending review items
- `POST /sme/bulk-action` - Execute bulk operations
- `PUT /sme/segments` - Update verse segments
- `GET /sme/work-summary/{work_id}` - Work-level summary

### Enhanced Review Endpoints
- `POST /review/verse/{verse_id}/approve` - Approve verse
- `POST /review/verse/{verse_id}/reject` - Reject with issues
- `POST /review/verse/{verse_id}/flag` - Flag for attention
- `POST /review/verse/{verse_id}/lock` - Lock verse

### Book Management Endpoints
- `POST /works` - Create new work/book
- `GET /works/{work_id}` - Get work details
- `PUT /works/{work_id}` - Update work
- `GET /works/{work_id}/verses` - List verses
- `POST /works/{work_id}/verses` - Create verse

## User Interface Features

### Responsive Design
- Mobile-optimized interface
- Touch-friendly controls
- Adaptive layouts
- Progressive enhancement

### Real-time Updates
- Live status indicators
- Automatic refresh capabilities
- Progress tracking
- Notification system

### Advanced Filtering
- Multi-criteria search
- Status-based filtering
- Date range selection
- User-specific views

### Batch Operations
- Multi-select interface
- Bulk action confirmation
- Progress indicators
- Error handling and rollback

## Security & Permissions

### Role-Based Access
- **SME**: Full dashboard access
- **Platform Admin**: All SME capabilities plus system admin
- **Admin**: Complete system access

### Audit Trail
- Complete action logging
- User attribution
- Timestamp tracking
- Change history preservation

### Data Validation
- Input sanitization
- Business rule enforcement
- Consistency checking
- Error prevention

## Integration Points

### Existing Systems
- Seamless integration with verse editor
- Admin panel coordination
- User management system
- Authentication framework

### Data Flow
- Real-time synchronization
- Conflict resolution
- State management
- Cache invalidation

## Performance Optimizations

### Efficient Loading
- Pagination support
- Lazy loading
- Caching strategies
- Optimized queries

### Scalability
- Bulk operation optimization
- Memory management
- Database indexing
- API rate limiting

## Future Enhancements

### Planned Features
- Advanced analytics dashboard
- Automated quality checks
- Machine learning integration
- Export/import capabilities
- Collaboration tools
- Notification system

### Extensibility
- Plugin architecture
- Custom workflow support
- API extensibility
- Theme customization

## Usage Guidelines

### Best Practices
1. Regular review of pending items
2. Use bulk operations for efficiency
3. Maintain detailed issue comments
4. Monitor work progress regularly
5. Coordinate with other SMEs

### Workflow Recommendations
1. Start with overview for daily planning
2. Process pending reviews by priority
3. Use bulk actions for similar items
4. Regular work progress monitoring
5. Maintain quality standards

## Support & Documentation

### Getting Help
- Built-in help tooltips
- Contextual guidance
- Error message clarity
- Support contact information

### Training Resources
- User guide documentation
- Video tutorials
- Best practice guides
- FAQ section

This SME Dashboard provides a complete, professional-grade interface for subject matter experts to efficiently manage content review, book creation, and quality assurance workflows with full audit trails and advanced analytics.