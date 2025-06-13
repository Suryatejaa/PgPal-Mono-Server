# Plan-Based Access Control Implementation

This document outlines the comprehensive plan-based restrictions implemented in the Property Service to control access for users with different subscription plans.

## Plan Types and Limits

### Free Plan

- **Properties**: 1 maximum
- **Rooms per Property**: 2 maximum
- **Beds per Property**: 10 maximum
- **Images per Property**: 5 maximum
- **Reviews Displayed**: 10 maximum
- **Features**: Basic property management, basic notifications, view reviews
- **Restrictions**: No analytics, no bulk operations, no advanced search, no amenity management

### Trial Plan

- **Properties**: 2 maximum
- **Rooms per Property**: 5 maximum
- **Beds per Property**: 25 maximum
- **Images per Property**: 10 maximum
- **Reviews Displayed**: 25 maximum
- **Features**: All Free features + basic analytics, amenity management
- **Restrictions**: No bulk operations, no advanced notifications, no advanced search
- **Duration**: 30 days

### Starter Plan

- **Properties**: 5 maximum
- **Rooms per Property**: 10 maximum
- **Beds per Property**: 50 maximum
- **Images per Property**: 20 maximum
- **Reviews Displayed**: 50 maximum
- **Features**: All Trial features + notifications, analytics, tenant management, rules management, advanced search
- **Restrictions**: Limited bulk operations

### Professional Plan

- **All Resources**: Unlimited
- **Features**: All features available
- **Restrictions**: None

## Implementation Details

### 1. Middleware-Based Validation

#### `validatePlanAccess(requiredFeature)`

- Validates if user's plan includes the required feature
- Attaches plan information to the request object
- Returns upgrade suggestions when access is denied

#### `validateResourceLimit(resourceType, currentCount)`

- Checks if adding new resources would exceed plan limits
- Works for properties, rooms, beds, and images

#### `validateBulkOperation(maxItems)`

- Restricts bulk operations based on plan
- Limits number of items in bulk operations for Starter plan

#### `validateAdvancedSearch()`

- Restricts advanced search features to Starter plan and above

### 2. Controller-Level Restrictions

#### Property Management

- **addProperty**: Checks maximum property limit before creation
- **updateTotalBeds**: Validates room and bed limits per property
- **deleteProperty**: Basic management feature (available from Free plan)

#### Image Management

- **uploadImages**: Enforces image per property limits based on plan
- Plan validation includes existing image count + new images

#### Review Management

- **getPropertyReviews**: Limits number of reviews displayed based on plan
- Returns plan information in response for frontend handling

#### Amenity Management

- **addAmenity/deleteAmenity**: Restricted to Trial plan and above
- Free plan users cannot manage amenities

#### Rules Management

- **addRule/deleteRule**: Restricted to Starter plan and above

#### Analytics

- **analytics**: Restricted to Trial plan and above
- **occupancyTrend**: Advanced analytics restricted to Trial plan and above

#### Search

- **searchProperties**: Advanced search features (filters, sorting, proximity) restricted to Starter plan and above
- Basic search (name, city, state, gender type) available to all plans

### 3. Route-Level Protection

Routes are protected using middleware in the following pattern:

```javascript
// Basic management (Free plan+)
router.post(
  "/",
  validatePlanAccess("add_property"),
  PropertyController.addProperty
);
router.put(
  "/:id",
  validatePlanAccess("basic_management"),
  PropertyController.updateProperty
);

// Amenity management (Trial plan+)
router.post(
  "/:id/amenities",
  validatePlanAccess("manage_amenities"),
  amenitiesController.addAmenity
);

// Rules management (Starter plan+)
router.post(
  "/:id/rules",
  validatePlanAccess("manage_rules"),
  rulesController.addRule
);

// Analytics (Trial plan+)
router.get(
  "/analytics",
  validatePlanAccess("analytics"),
  PropertyController.analytics
);
```

### 4. Plan Information Endpoints

#### `/plan-info`

Returns comprehensive plan information including:

- Current plan type
- Feature availability
- Resource limits
- Active restrictions

#### `/plan-usage`

Returns current usage statistics:

- Properties, rooms, beds, images count
- Usage percentages against limits
- Upgrade recommendations

### 5. Frontend Integration

The API provides upgrade information in error responses:

```json
{
  "error": "Property limit reached. Your free plan allows 1 properties.",
  "currentCount": 1,
  "maxAllowed": 1,
  "upgradeRequired": true,
  "suggestedPlan": "trial"
}
```

### 6. Helper Utilities

#### `PlanHelper` Class

- Centralizes plan-related logic
- Provides methods for feature checking
- Calculates usage statistics
- Generates upgrade suggestions

#### Key Methods:

- `getUserPlan(currentUser)`: Extracts and normalizes plan information
- `hasFeature(userPlan, feature)`: Checks feature availability
- `checkResourceLimit(userPlan, resourceType, currentCount)`: Validates resource limits
- `getPlanSummary(userPlan)`: Generates comprehensive plan summary

### 7. Caching Considerations

Plan validation results are not cached to ensure real-time enforcement of limits and feature restrictions. However, plan information itself can be cached for performance.

### 8. Error Handling

All plan-related errors include:

- Clear error messages
- Current usage information
- Upgrade suggestions
- Plan comparison data

This implementation ensures that users are properly restricted based on their subscription level while providing clear paths for upgrading when limits are reached.
