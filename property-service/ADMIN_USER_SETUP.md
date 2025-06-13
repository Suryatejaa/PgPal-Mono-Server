
# Admin User Setup Guide

## Creating Admin Users

To create admin users for the dashboard, you need to set the appropriate role and adminLevel in your user records.

### Admin User Structure
```javascript
{
    "_id": "admin_user_id",
    "email": "admin@pgpaal.com",
    "role": "admin",           // or "super_admin"
    "adminLevel": "admin",     // or "super_admin"
    "name": "Admin User",
    "createdAt": new Date(),
    "isActive": true
}
```

### Permission Levels
- **admin**: Can view dashboard, manage properties/users, perform bulk operations
- **super_admin**: All admin permissions plus system maintenance, configuration changes

### Authentication Headers
When making API requests, include the user information in headers:
```javascript
const headers = {
    'x-user': JSON.stringify({
        data: {
            user: {
                id: 'admin_user_id',
                email: 'admin@pgpaal.com',
                role: 'admin',
                adminLevel: 'admin'
            }
        }
    }),
    'Content-Type': 'application/json'
};
```

### Testing Admin Access
Run the test script to verify admin functionality:
```bash
node scripts/testAdminDashboard.js
```
