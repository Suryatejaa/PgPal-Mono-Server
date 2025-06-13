# Plan Restrictions Testing Guide

## Overview

This document provides a comprehensive guide for testing the implemented plan-based access restrictions in the PGPaal property service. The system now enforces different limitations and feature access based on user subscription plans (Free, Trial, Starter, Professional).

## Prerequisites

### 1. Environment Setup

```bash
# Install dependencies
npm install

# Install additional testing dependencies
npm install colors jest supertest

# Ensure MongoDB is running
# Ensure Redis is running (for caching)
```

### 2. Server Requirements

- Property service running on port 3002
- MongoDB connection established
- Redis connection established (optional, for caching)

## Testing Scripts Available

### 1. Implementation Validation

```bash
npm run validate:implementation
```

**Purpose**: Validates that all plan restriction components are properly implemented
**Output**: Checks configuration files, middleware, controllers, routes, and documentation

### 2. Connectivity Test

```bash
npm run test:connectivity
```

**Purpose**: Quick test to verify server connectivity and basic plan restrictions
**Output**: Tests server reachability and a simple plan restriction

### 3. Manual Plan Restrictions Test

```bash
npm run test:plan-restrictions
```

**Purpose**: Comprehensive manual testing of all plan restrictions
**Output**: Detailed test results for all plan features and limitations

### 4. Development Environment Test

```bash
npm run test:plan-restrictions:dev
```

**Purpose**: Same as above but explicitly targets local development server

## Test User Accounts

The testing system uses predefined test users with different plan types:

### Free User

```json
{
  "_id": "64a1b2c3d4e5f6789abcdef0",
  "pgpalId": "FREE_USER_001",
  "role": "owner",
  "currentPlan": { "type": "free" }
}
```

**Limitations**:

- 1 property maximum
- 2 rooms per property maximum
- 10 beds per property maximum
- 5 images per property maximum
- 10 reviews displayed maximum
- No analytics access
- No amenity management
- No rules management
- No advanced search

### Trial User

```json
{
  "_id": "64a1b2c3d4e5f6789abcdef1",
  "pgpalId": "TRIAL_USER_001",
  "role": "owner",
  "currentPlan": { "type": "trial" }
}
```

**Limitations**:

- 2 properties maximum
- 5 rooms per property maximum
- 25 beds per property maximum
- 10 images per property maximum
- 25 reviews displayed maximum
- Basic analytics access
- Amenity management allowed
- No rules management
- No advanced search

### Starter User

```json
{
  "_id": "64a1b2c3d4e5f6789abcdef2",
  "pgpalId": "STARTER_USER_001",
  "role": "owner",
  "currentPlan": { "type": "starter" }
}
```

**Limitations**:

- 5 properties maximum
- 10 rooms per property maximum
- 50 beds per property maximum
- 20 images per property maximum
- 50 reviews displayed maximum
- Full analytics access
- All management features
- Advanced search allowed
- Limited bulk operations

### Professional User

```json
{
  "_id": "64a1b2c3d4e5f6789abcdef3",
  "pgpalId": "PRO_USER_001",
  "role": "owner",
  "currentPlan": { "type": "professional" }
}
```

**Limitations**: None - unlimited access to all features

## Manual Testing Scenarios

### 1. Property Limits Testing

#### Test 1.1: Free User Property Limit

1. Use Free User credentials
2. Create first property → Should succeed
3. Attempt to create second property → Should fail with 403 error
4. Verify error message includes upgrade information

#### Test 1.2: Trial User Property Limit

1. Use Trial User credentials
2. Create two properties → Should succeed
3. Attempt to create third property → Should fail with 403 error

### 2. Feature Access Testing

#### Test 2.1: Amenity Management

1. **Free User**: POST to `/properties/{id}/amenities` → Should fail (403)
2. **Trial User**: POST to `/properties/{id}/amenities` → Should succeed (200)

#### Test 2.2: Analytics Access

1. **Free User**: GET `/properties/analytics` → Should fail (403)
2. **Trial User**: GET `/properties/analytics` → Should succeed (200/404)

#### Test 2.3: Rules Management

1. **Free User**: POST to `/properties/{id}/rules` → Should fail (403)
2. **Starter User**: POST to `/properties/{id}/rules` → Should succeed (201)

### 3. Search Restrictions Testing

#### Test 3.1: Basic Search (All Users)

```bash
GET /properties/search?city=TestCity&state=TestState
```

Should work for all plan types

#### Test 3.2: Advanced Search

```bash
GET /properties/search?city=TestCity&minRent=5000&maxRent=10000&amenities=WiFi,AC&sortBy=price_low
```

- **Free/Trial Users**: Should fail (403)
- **Starter/Professional Users**: Should succeed

### 4. Plan Information Endpoints

#### Test 4.1: Plan Info

```bash
GET /properties/plan-info
```

Should return plan details for authenticated users

#### Test 4.2: Plan Usage

```bash
GET /properties/plan-usage
```

Should return current usage statistics against plan limits

### 5. Resource Limits Testing

#### Test 5.1: Room/Bed Limits

```bash
PATCH /properties/properties/{id}/update-beds
{
  "totalRooms": 5,  // May exceed Free plan limit (2)
  "totalBeds": 15   // May exceed Free plan limit (10)
}
```

#### Test 5.2: Image Upload Limits

Test uploading images beyond plan limits using image upload endpoints.

## Expected Error Response Format

Plan restriction errors should include:

```json
{
  "error": "Feature requires starter plan or higher",
  "currentPlan": "free",
  "upgradeRequired": true,
  "suggestedPlan": "starter",
  "currentCount": 1,
  "maxAllowed": 1
}
```

## Testing Checklist

### Pre-Testing

- [ ] All dependencies installed
- [ ] Server running on correct port
- [ ] Database connections established
- [ ] Implementation validation passed (100%)

### Property Limits

- [ ] Free user limited to 1 property
- [ ] Trial user limited to 2 properties
- [ ] Starter user limited to 5 properties
- [ ] Professional user has unlimited properties
- [ ] Error messages include upgrade information

### Feature Access

- [ ] Free user blocked from analytics
- [ ] Free user blocked from amenity management
- [ ] Free user blocked from rules management
- [ ] Trial user can access analytics and amenities
- [ ] Starter user can access all features

### Search Restrictions

- [ ] Basic search works for all users
- [ ] Advanced search blocked for Free/Trial users
- [ ] Advanced search works for Starter/Professional users

### Plan Information

- [ ] Plan info endpoint returns correct data
- [ ] Plan usage endpoint shows current usage
- [ ] Both endpoints require authentication

### Error Handling

- [ ] Unauthenticated requests return 401
- [ ] Tenant users blocked from owner operations
- [ ] Error responses include upgrade paths
- [ ] Resource limits enforced correctly

## Troubleshooting

### Common Issues

1. **Server Connection Failed**

   - Ensure property service is running: `npm start`
   - Check port 3002 is available
   - Verify environment configuration

2. **Authentication Errors**

   - Verify `x-user` header format
   - Check user object structure
   - Ensure role is set correctly

3. **Plan Validation Not Working**

   - Check middleware order in routes
   - Verify plan configuration in `planLimits.js`
   - Ensure PlanHelper is imported correctly

4. **Database Errors**
   - Ensure MongoDB is running
   - Check database connection string
   - Verify collection permissions

## Integration with Frontend

For frontend integration, the API provides:

1. **Plan Information**: Use `/plan-info` to display current plan details
2. **Usage Statistics**: Use `/plan-usage` to show usage against limits
3. **Upgrade Prompts**: Error responses include suggested upgrade plans
4. **Feature Availability**: Check plan features before showing UI elements

## Performance Considerations

- Plan validation adds minimal overhead to requests
- Plan information is not cached to ensure real-time enforcement
- Consider caching user plan data in frontend for UI decisions
- Monitor API response times with plan validation enabled

## Security Notes

- Plan validation relies on authenticated user data
- Always validate plan restrictions on server-side
- Frontend plan checks are for UX only, not security
- Plan bypassing should be impossible without proper authentication

This comprehensive testing approach ensures that all plan restrictions are working correctly and provides confidence in the implementation before deployment.
