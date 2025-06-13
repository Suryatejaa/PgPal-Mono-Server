# Admin Dashboard API Documentation

## Overview

This documentation covers the admin dashboard server-side API for the Room Service. The admin dashboard provides comprehensive analytics, monitoring, and management capabilities for PG (Paying Guest) accommodations.

## Base URL

```
/api/admin/room-service
```

## Authentication

All admin endpoints require authentication with admin or superadmin role. Include the user information in the `x-user` header:

```json
{
  "data": {
    "user": {
      "_id": "user_id",
      "role": "admin", // or "superadmin"
      "email": "admin@example.com"
    }
  }
}
```

## Endpoints

### Dashboard Analytics

#### 1. Basic Dashboard Overview

**GET** `/dashboard/overview`

Returns main dashboard statistics including room counts, occupancy rates, and basic analytics.

**Response:**

```json
{
  "success": true,
  "data": {
    "totalRooms": 150,
    "totalBeds": 600,
    "occupiedBeds": 450,
    "vacantBeds": 150,
    "occupancyRate": 75.0,
    "recentRooms": 12,
    "roomsByType": [
      { "_id": "single", "count": 30, "totalBeds": 30 },
      { "_id": "double", "count": 60, "totalBeds": 120 }
    ],
    "roomsByStatus": [
      { "_id": "occupied", "count": 90 },
      { "_id": "vacant", "count": 60 }
    ],
    "occupancyStats": [
      { "_id": "occupied", "count": 450 },
      { "_id": "vacant", "count": 150 }
    ],
    "lastUpdated": "2025-06-09T10:30:00.000Z"
  }
}
```

#### 2. Advanced Dashboard with Trends

**GET** `/dashboard/advanced?period=30d`

Returns enhanced dashboard with trend analysis and comparisons.

**Query Parameters:**

- `period` (string): Time period for analysis ('7d', '30d', '90d', '1y')

**Response:**

```json
{
  "success": true,
  "data": {
    "period": "30d",
    "currentStats": {
      "totalRooms": 150,
      "totalBeds": 600,
      "avgRent": 8500,
      "totalRevenue": 5100000
    },
    "previousStats": {
      "totalRooms": 140,
      "totalBeds": 560,
      "avgRent": 8200,
      "totalRevenue": 4592000
    },
    "trends": {
      "rooms": "7.14",
      "beds": "7.14",
      "revenue": "11.06",
      "avgRent": "3.66"
    },
    "occupancyTrend": [
      { "_id": { "date": "2025-05-10", "status": "occupied" }, "count": 400 },
      { "_id": { "date": "2025-05-11", "status": "occupied" }, "count": 410 }
    ],
    "performanceMetrics": {
      "efficiency": 75.0,
      "utilization": 60.0,
      "averageOccupancyPerRoom": 3.0,
      "revenuePerBed": 8500,
      "revenuePerRoom": 34000
    },
    "formattedRevenue": "₹51,00,000",
    "lastUpdated": "2025-06-09T10:30:00.000Z"
  }
}
```

#### 3. Property Analytics

**GET** `/analytics/property`

Returns detailed analytics grouped by property.

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "_id": "property_id_1",
      "totalRooms": 50,
      "totalBeds": 200,
      "avgRentPerBed": 8500,
      "roomTypes": ["single", "double", "triple"],
      "floors": [1, 2, 3],
      "occupiedBeds": 150,
      "vacantBeds": 50,
      "occupancyRate": 75.0,
      "revenue": 1275000,
      "propertyInfo": [...]
    }
  ]
}
```

#### 4. Revenue Analytics

**GET** `/analytics/revenue`

Returns comprehensive revenue analysis including potential vs actual revenue.

**Response:**

```json
{
  "success": true,
  "data": {
    "propertyRevenue": [
      {
        "_id": "property_id",
        "roomTypes": [
          {
            "type": "single",
            "totalBeds": 30,
            "occupiedBeds": 25,
            "rentPerBed": 8000,
            "actualRevenue": 200000,
            "potentialRevenue": 240000
          }
        ],
        "totalActualRevenue": 1500000,
        "totalPotentialRevenue": 2000000
      }
    ],
    "overallRevenue": {
      "totalActual": 5100000,
      "totalPotential": 6800000
    },
    "revenueEfficiency": 75.0,
    "lastUpdated": "2025-06-09T10:30:00.000Z"
  }
}
```

#### 5. Advanced Analytics

**GET** `/analytics/advanced?groupBy=property&timeframe=30d&metrics=occupancy,revenue`

Returns flexible analytics with custom grouping and metrics.

**Query Parameters:**

- `groupBy` (string): Group data by ('property', 'type', 'floor', 'date')
- `timeframe` (string): Time period ('7d', '30d', '90d')
- `metrics` (array): Metrics to include (['occupancy', 'revenue'])

### Room Management

#### 6. Get All Rooms

**GET** `/rooms?page=1&limit=20&status=occupied&type=single`

Returns paginated list of rooms with filtering options.

**Query Parameters:**

- `page` (number): Page number (default: 1)
- `limit` (number): Items per page (default: 20)
- `status` (string): Filter by room status
- `type` (string): Filter by room type
- `propertyId` (string): Filter by property ID
- `floor` (number): Filter by floor number
- `search` (string): Search by room number or PGPal ID

**Response:**

```json
{
  "success": true,
  "data": {
    "rooms": [
      {
        "_id": "room_id",
        "propertyId": "property_id",
        "roomNumber": 101,
        "floor": 1,
        "type": "double",
        "totalBeds": 2,
        "rentPerBed": 8500,
        "beds": [
          {
            "bedId": "bed_001",
            "status": "occupied",
            "tenantNo": "tenant_123",
            "tenantPpt": "tenant_ppt_456"
          }
        ],
        "pgpalId": "PPR123456",
        "status": "partially occupied",
        "createdAt": "2025-05-01T10:00:00.000Z",
        "updatedAt": "2025-06-01T15:30:00.000Z"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 8,
      "totalRooms": 150,
      "hasNextPage": true,
      "hasPrevPage": false
    }
  }
}
```

#### 7. Advanced Room Search

**GET** `/rooms/search?search=PPR123&minRent=5000&maxRent=10000&bedStatus=vacant`

Advanced search with multiple filters.

**Query Parameters:**

- `search` (string): Search term
- `propertyId` (string): Property ID filter
- `status` (string): Room status filter
- `type` (string): Room type filter
- `floor` (number): Floor filter
- `minRent` (number): Minimum rent filter
- `maxRent` (number): Maximum rent filter
- `bedStatus` (string): Bed status filter
- `sortBy` (string): Sort field (default: 'createdAt')
- `sortOrder` (string): Sort order ('asc', 'desc')

#### 8. Bulk Update Rooms

**PUT** `/rooms/bulk-update`

Update multiple rooms at once.

**Request Body:**

```json
{
  "roomIds": ["room_id_1", "room_id_2", "room_id_3"],
  "updates": {
    "rentPerBed": 9000,
    "status": "vacant"
  }
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "matchedCount": 3,
    "modifiedCount": 3,
    "updatedRooms": ["room_id_1", "room_id_2", "room_id_3"]
  }
}
```

### Activity Monitoring

#### 9. Get Activity Logs

**GET** `/activity/logs?page=1&limit=50&timeframe=7d&action=GET&resource=room`

Returns admin activity logs with filtering options.

**Query Parameters:**

- `page` (number): Page number
- `limit` (number): Items per page
- `userId` (string): Filter by user ID
- `action` (string): Filter by action
- `resource` (string): Filter by resource type
- `status` (string): Filter by status
- `timeframe` (string): Time period ('7d', '30d', '90d')

**Response:**

```json
{
  "success": true,
  "data": {
    "logs": [
      {
        "_id": "log_id",
        "userId": "user_id",
        "userEmail": "admin@example.com",
        "action": "GET /rooms/search",
        "resource": "room",
        "resourceId": null,
        "details": {
          "query": { "search": "PPR123" },
          "params": {}
        },
        "ip": "192.168.1.100",
        "userAgent": "Mozilla/5.0...",
        "timestamp": "2025-06-09T10:30:00.000Z",
        "status": "success",
        "duration": 156,
        "metadata": {
          "statusCode": 200,
          "responseSize": 2048
        }
      }
    ],
    "summary": [
      {
        "_id": "GET /dashboard/overview",
        "totalCount": 25,
        "successCount": 25,
        "errorCount": 0,
        "avgDuration": 89.5,
        "uniqueUsers": 3
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 5,
      "totalLogs": 250,
      "hasNextPage": true,
      "hasPrevPage": false
    }
  }
}
```

#### 10. Get User Activity

**GET** `/activity/user/{userId}?timeframe=7d`

Returns activity data for a specific user.

**Response:**

```json
{
  "success": true,
  "data": {
    "userId": "user_id",
    "timeframe": "7d",
    "recentActivity": [
      {
        "action": "GET /dashboard/overview",
        "timestamp": "2025-06-09T10:30:00.000Z",
        "status": "success",
        "duration": 89
      }
    ],
    "activitySummary": [
      {
        "_id": "2025-06-09",
        "actions": 15,
        "resources": ["room", "dashboard", "analytics"],
        "avgDuration": 124.5,
        "errors": 0
      }
    ]
  }
}
```

### System Monitoring

#### 11. System Health

**GET** `/system/health`

Returns system health metrics and monitoring data.

**Response:**

```json
{
  "success": true,
  "data": {
    "database": {
      "status": "healthy",
      "collections": 5,
      "dataSize": 15728640,
      "storageSize": 32768000,
      "indexes": 12
    },
    "roomCollection": {
      "count": 150,
      "size": 1048576,
      "avgObjSize": 6990
    },
    "redis": {
      "status": "healthy"
    },
    "recentActivity": {
      "roomsCreated": 3,
      "roomsUpdated": 12
    },
    "serverTime": "2025-06-09T10:30:00.000Z",
    "uptime": 86400
  }
}
```

### Data Export

#### 12. Export Data

**GET** `/export?format=json&type=rooms`

Export system data in various formats.

**Query Parameters:**

- `format` (string): Export format ('json', 'csv')
- `type` (string): Data type to export ('rooms', 'analytics', 'all')

**Response:**

```json
{
  "success": true,
  "exportedAt": "2025-06-09T10:30:00.000Z",
  "type": "rooms",
  "data": {
    "rooms": [...],
    "summary": [...]
  }
}
```

## Error Responses

All endpoints return consistent error responses:

```json
{
  "error": "Error message describing what went wrong"
}
```

Common HTTP status codes:

- `400` - Bad Request (missing parameters, invalid data)
- `401` - Unauthorized (missing or invalid authentication)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found (resource doesn't exist)
- `500` - Internal Server Error (server-side error)

## Rate Limiting

Admin endpoints have the following rate limits:

- Dashboard endpoints: 60 requests per minute
- Analytics endpoints: 30 requests per minute
- Bulk operations: 10 requests per minute
- Export operations: 5 requests per minute

## Caching

Many endpoints use Redis caching to improve performance:

- Dashboard overview: 5 minutes
- Property analytics: 10 minutes
- Revenue analytics: 15 minutes
- System health: No cache (real-time data)

## Usage Examples

### JavaScript/Fetch

```javascript
// Get dashboard overview
const response = await fetch("/api/admin/room-service/dashboard/overview", {
  headers: {
    "x-user": JSON.stringify({
      data: {
        user: {
          _id: "admin_id",
          role: "admin",
          email: "admin@example.com",
        },
      },
    }),
  },
});

const data = await response.json();
```

### cURL

```bash
# Get all rooms with filters
curl -X GET "http://localhost:4003/api/admin/room-service/rooms?page=1&limit=10&status=occupied" \
  -H "x-user: {\"data\":{\"user\":{\"_id\":\"admin_id\",\"role\":\"admin\",\"email\":\"admin@example.com\"}}}"
```

## Notes

1. All timestamps are in ISO 8601 format (UTC)
2. All monetary values are in the smallest currency unit (paisa for INR)
3. Pagination uses 1-based indexing
4. All endpoints support CORS for approved origins
5. Request/response logging is enabled for all admin operations
6. Admin actions are tracked and logged for audit purposes
