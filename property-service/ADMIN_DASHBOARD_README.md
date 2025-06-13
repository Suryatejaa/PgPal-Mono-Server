# PGPaal Admin Dashboard

## Overview

The PGPaal Admin Dashboard is a comprehensive administrative interface that provides full system control and monitoring capabilities for the property service. It includes real-time analytics, user management, property oversight, and system maintenance tools.

## 🚀 Features

### Dashboard Overview

- **Real-time System Metrics**: Total properties, users, reviews, and system health
- **Plan Distribution Analytics**: Visual breakdown of user subscription plans
- **Recent Activity Monitoring**: Latest property listings and user activities
- **Performance Metrics**: Average views, occupancy rates, and growth trends

### Property Management

- **Advanced Property Listing**: Filterable, searchable, and paginated property views
- **Property Details**: Comprehensive property information with admin insights
- **Force Delete**: Permanent property removal with proper cleanup
- **Status Management**: Suspend/reactivate properties with owner notifications
- **Bulk Operations**: Mass property operations for efficiency

### User Management

- **User Listing**: Advanced filtering and search capabilities
- **User Details**: Complete user profiles with property statistics
- **Account Management**: Suspend/reactivate user accounts
- **Plan Management**: View and manage user subscription plans
- **Bulk User Operations**: Mass user management operations

### System Analytics

- **Property Analytics**: Growth trends, performance metrics, and occupancy data
- **User Analytics**: Registration trends, activity patterns, and engagement metrics
- **Revenue Analytics**: Plan subscriptions and revenue tracking
- **Custom Time Periods**: Flexible date range selection for reports

### Bulk Operations

- **Property Operations**: Bulk suspend, reactivate, or delete properties
- **User Operations**: Mass user account management
- **Review Operations**: Bulk review moderation and management
- **Safety Checks**: Confirmation prompts and rollback capabilities

### System Maintenance

- **Cache Management**: Clear system caches and optimize performance
- **Data Cleanup**: Remove orphaned data and optimize database
- **Metrics Recalculation**: Refresh system statistics and analytics
- **Health Monitoring**: System health checks and performance monitoring

### Notification System

- **System-wide Notifications**: Send announcements to all users
- **Targeted Messaging**: Notifications to specific user groups
- **Notification History**: Track and manage notification campaigns
- **Template Management**: Pre-defined notification templates

### Data Export

- **Multiple Formats**: JSON, CSV, and Excel export options
- **Selective Export**: Choose specific data fields and filters
- **Scheduled Exports**: Automated data export capabilities
- **Privacy Compliance**: Sanitized exports for user data protection

## 🔐 Security Features

### Authentication & Authorization

- **Role-based Access Control**: Admin and Super Admin permission levels
- **JWT Token Validation**: Secure authentication with token verification
- **Session Management**: Automatic session timeout and renewal
- **Audit Logging**: Complete activity tracking for compliance

### Rate Limiting

- **Admin Rate Limiting**: Protection against API abuse
- **Operation Throttling**: Prevent system overload during bulk operations
- **IP-based Restrictions**: Block malicious IP addresses
- **Request Monitoring**: Track and analyze admin API usage

### Data Protection

- **Sensitive Data Masking**: Protect user privacy in exports
- **Secure API Endpoints**: HTTPS-only with proper headers
- **Input Validation**: Prevent injection attacks and data corruption
- **Backup & Recovery**: Automated backup before destructive operations

## 📊 API Endpoints

### Dashboard & Overview

```
GET /api/property-service/admin/dashboard/overview
```

Returns comprehensive system statistics and metrics.

### Property Management

```
GET    /api/property-service/admin/properties
GET    /api/property-service/admin/properties/:id
DELETE /api/property-service/admin/properties/:id/force-delete
PATCH  /api/property-service/admin/properties/:id/toggle-status
```

### User Management

```
GET   /api/property-service/admin/users
GET   /api/property-service/admin/users/:id
PATCH /api/property-service/admin/users/:id/toggle-status
```

### Analytics

```
GET /api/property-service/admin/analytics
```

### Bulk Operations

```
POST /api/property-service/admin/bulk-operations
```

### System Maintenance

```
POST /api/property-service/admin/maintenance
```

### Notifications

```
POST /api/property-service/admin/notifications/send
```

### Data Export

```
GET /api/property-service/admin/export
```

## 🛠️ Installation & Setup

### Prerequisites

- Node.js 16+ and npm
- MongoDB 4.4+
- Redis (for caching)
- Property Service running on port 4002

### Installation

1. **Install Dependencies**

   ```bash
   npm install
   ```

2. **Environment Configuration**
   Create a `.env` file with required variables:

   ```env
   MONGO_URI=mongodb://localhost:27017/pgpaal
   REDIS_URL=redis://localhost:6379
   JWT_SECRET=your_jwt_secret
   ADMIN_SECRET_KEY=your_admin_secret
   ```

3. **Start the Service**

   ```bash
   npm start
   ```

4. **Verify Installation**
   ```bash
   node scripts/testAdminDashboard.js
   ```

## 🧪 Testing

### Run Admin Dashboard Tests

```bash
# Test all admin functionality
node scripts/testAdminDashboard.js

# Test specific components
npm test -- --grep "admin"
```

### Test Coverage

- Authentication and authorization
- API endpoint functionality
- Data validation and sanitization
- Error handling and recovery
- Performance and load testing

## 📝 Usage Examples

### Authentication Headers

```javascript
const adminHeaders = {
  "x-user": JSON.stringify({
    data: {
      user: {
        id: "admin-123",
        email: "admin@pgpaal.com",
        role: "admin",
        adminLevel: "admin",
      },
    },
  }),
  "Content-Type": "application/json",
};
```

### Get Dashboard Overview

```javascript
const response = await axios.get(
  "http://localhost:4002/api/property-service/admin/dashboard/overview",
  { headers: adminHeaders }
);
console.log(response.data);
```

### Bulk Property Operations

```javascript
const bulkData = {
  operation: "suspend",
  entityType: "properties",
  entityIds: ["prop1", "prop2", "prop3"],
  reason: "Policy violation",
};

const response = await axios.post(
  "http://localhost:4002/api/property-service/admin/bulk-operations",
  bulkData,
  { headers: adminHeaders }
);
```

### Send System Notification

```javascript
const notification = {
  title: "System Maintenance",
  message: "Scheduled maintenance tonight from 12-2 AM",
  type: "warning",
  audience: "all",
};

await axios.post(
  "http://localhost:4002/api/property-service/admin/notifications/send",
  notification,
  { headers: superAdminHeaders }
);
```

### Export Data

```javascript
const response = await axios.get(
  "http://localhost:4002/api/property-service/admin/export?type=properties&format=json&limit=100",
  { headers: adminHeaders }
);

// Save or process the exported data
const exportedData = response.data;
```

## 🎨 Frontend Integration

### React Component

A complete React admin dashboard component is provided in `examples/AdminDashboard.jsx`. Features include:

- Real-time dashboard updates
- Interactive property and user management
- Bulk operation interfaces
- Data visualization components
- Export functionality
- Responsive design

### Usage in React App

```javascript
import AdminDashboard from "./components/AdminDashboard";
import "./components/AdminDashboard.css";

function App() {
  return (
    <div className="App">
      <AdminDashboard />
    </div>
  );
}
```

## 🔧 Configuration

### Admin Role Configuration

```javascript
// In your auth service, define admin roles:
const adminRoles = {
  admin: {
    permissions: ["read", "write", "bulk_operations"],
    restrictions: ["no_user_deletion", "no_system_config"],
  },
  super_admin: {
    permissions: ["read", "write", "bulk_operations", "system_admin"],
    restrictions: [],
  },
};
```

### Rate Limiting Configuration

```javascript
// Customize rate limits in middleware/adminAuth.js
const adminRateLimit = ((maxRequests = 100), (windowMs = 15 * 60 * 1000));
```

### Cache Configuration

```javascript
// Configure cache TTL for admin data
const ADMIN_CACHE_TTL = {
  dashboard: 300, // 5 minutes
  properties: 60, // 1 minute
  users: 60, // 1 minute
  analytics: 1800, // 30 minutes
};
```

## 📈 Performance Optimization

### Caching Strategy

- Dashboard overview cached for 5 minutes
- Property/user lists cached for 1 minute
- Analytics data cached for 30 minutes
- Cache invalidation on data modifications

### Database Optimization

- Proper indexing for admin queries
- Aggregation pipelines for analytics
- Connection pooling for high loads
- Query optimization for large datasets

### Memory Management

- Streaming for large data exports
- Pagination for list endpoints
- Lazy loading for dashboard components
- Memory cleanup after bulk operations

## 🚨 Monitoring & Alerts

### System Health Monitoring

- API response times
- Database connection status
- Cache hit rates
- Memory and CPU usage

### Alert Configuration

- Failed authentication attempts
- Unusual bulk operation patterns
- System performance degradation
- Database connection issues

### Logging

- All admin actions logged
- API request/response logging
- Error tracking and reporting
- Performance metrics collection

## 🔄 Backup & Recovery

### Automated Backups

- Daily database backups
- Configuration file backups
- Log file archival
- Point-in-time recovery capability

### Disaster Recovery

- Multi-region backup storage
- Automated failover procedures
- Data integrity verification
- Recovery time objectives (RTO)

## 📞 Support & Maintenance

### Regular Maintenance Tasks

- Database optimization
- Cache cleanup
- Log rotation
- Security updates

### Support Contacts

- **Technical Support**: tech@pgpaal.com
- **Emergency Contact**: emergency@pgpaal.com
- **Documentation**: docs.pgpaal.com/admin

### Version Updates

- Backward compatibility maintained
- Migration scripts provided
- Feature deprecation notices
- Update testing procedures

## 📋 Troubleshooting

### Common Issues

**Authentication Failures**

- Verify JWT token format
- Check user role permissions
- Validate token expiration

**Performance Issues**

- Monitor cache hit rates
- Check database query performance
- Analyze bulk operation sizes

**Data Export Problems**

- Verify file permissions
- Check available disk space
- Monitor memory usage during exports

### Debug Mode

```bash
# Enable debug logging
DEBUG=admin:* npm start
```

### Log Analysis

```bash
# View admin activity logs
grep "Admin Audit Log" logs/admin.log | tail -50

# Monitor API performance
grep "slow_query" logs/performance.log
```

## 📚 Additional Resources

- [API Documentation](./API_DOCUMENTATION.md)
- [Security Guidelines](./SECURITY.md)
- [Performance Tuning](./PERFORMANCE.md)
- [Deployment Guide](./DEPLOYMENT.md)

---

**Note**: This admin dashboard provides powerful system control capabilities. Always follow security best practices and maintain proper access controls in production environments.
