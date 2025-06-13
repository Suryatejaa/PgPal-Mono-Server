// Sample React Admin Dashboard Component
// This demonstrates how to integrate with the admin API endpoints

import React, { useState, useEffect } from 'react';
import axios from 'axios';

const ADMIN_API_BASE = 'http://localhost:4002/api/property-service/admin';

// Mock admin authentication - replace with your actual auth system
const getAdminHeaders = () => ({
    'x-user': JSON.stringify({
        data: {
            user: {
                id: 'admin-123',
                email: 'admin@pgpaal.com',
                role: 'admin',
                adminLevel: 'admin'
            }
        }
    }),
    'Content-Type': 'application/json'
});

const AdminDashboard = () => {
    const [dashboardData, setDashboardData] = useState(null);
    const [properties, setProperties] = useState([]);
    const [users, setUsers] = useState([]);
    const [analytics, setAnalytics] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('overview');

    useEffect(() => {
        loadDashboardData();
    }, []);

    const loadDashboardData = async () => {
        try {
            setLoading(true);
            const headers = getAdminHeaders();

            const [overviewRes, propertiesRes, usersRes, analyticsRes] = await Promise.all([
                axios.get(`${ADMIN_API_BASE}/dashboard/overview`, { headers }),
                axios.get(`${ADMIN_API_BASE}/properties?limit=10`, { headers }),
                axios.get(`${ADMIN_API_BASE}/users?limit=10`, { headers }),
                axios.get(`${ADMIN_API_BASE}/analytics`, { headers })
            ]);

            setDashboardData(overviewRes.data);
            setProperties(propertiesRes.data.properties || []);
            setUsers(usersRes.data.users || []);
            setAnalytics(analyticsRes.data);
        } catch (error) {
            console.error('Error loading dashboard data:', error);
            alert('Failed to load dashboard data. Please check your admin permissions.');
        } finally {
            setLoading(false);
        }
    };

    const handleBulkOperation = async (operation, entityType, entityIds) => {
        try {
            const headers = getAdminHeaders();
            const response = await axios.post(`${ADMIN_API_BASE}/bulk-operations`, {
                operation,
                entityType,
                entityIds,
                reason: `Bulk ${operation} operation`
            }, { headers });

            alert(`Bulk operation ${operation} completed successfully`);
            loadDashboardData(); // Refresh data
        } catch (error) {
            console.error('Bulk operation failed:', error);
            alert('Bulk operation failed. Please try again.');
        }
    };

    const handleSendNotification = async () => {
        try {
            const headers = getAdminHeaders();
            const response = await axios.post(`${ADMIN_API_BASE}/notifications/send`, {
                title: 'System Maintenance Notice',
                message: 'The system will undergo maintenance tonight from 12 AM to 2 AM.',
                type: 'warning',
                audience: 'all'
            }, { headers });

            alert('Notification sent successfully');
        } catch (error) {
            console.error('Failed to send notification:', error);
            alert('Failed to send notification');
        }
    };

    const handleExportData = async (type, format = 'json') => {
        try {
            const headers = getAdminHeaders();
            const response = await axios.get(`${ADMIN_API_BASE}/export?type=${type}&format=${format}`, { headers });

            // Create downloadable file
            const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${type}-export-${new Date().toISOString().split('T')[0]}.${format}`;
            a.click();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Export failed:', error);
            alert('Export failed. Please try again.');
        }
    };

    if (loading) {
        return (
            <div className="admin-dashboard loading">
                <div className="spinner">Loading admin dashboard...</div>
            </div>
        );
    }

    return (
        <div className="admin-dashboard">
            <header className="dashboard-header">
                <h1>🎛️ PGPaal Admin Dashboard</h1>
                <div className="admin-actions">
                    <button onClick={handleSendNotification} className="btn btn-primary">
                        📢 Send Notification
                    </button>
                    <button onClick={() => handleExportData('properties')} className="btn btn-secondary">
                        📥 Export Properties
                    </button>
                </div>
            </header>

            <nav className="dashboard-nav">
                <button 
                    className={`nav-tab ${activeTab === 'overview' ? 'active' : ''}`}
                    onClick={() => setActiveTab('overview')}
                >
                    📊 Overview
                </button>
                <button 
                    className={`nav-tab ${activeTab === 'properties' ? 'active' : ''}`}
                    onClick={() => setActiveTab('properties')}
                >
                    🏠 Properties
                </button>
                <button 
                    className={`nav-tab ${activeTab === 'users' ? 'active' : ''}`}
                    onClick={() => setActiveTab('users')}
                >
                    👥 Users
                </button>
                <button 
                    className={`nav-tab ${activeTab === 'analytics' ? 'active' : ''}`}
                    onClick={() => setActiveTab('analytics')}
                >
                    📈 Analytics
                </button>
            </nav>

            <main className="dashboard-content">
                {activeTab === 'overview' && (
                    <div className="overview-tab">
                        <div className="stats-grid">
                            <div className="stat-card">
                                <h3>Total Properties</h3>
                                <div className="stat-value">{dashboardData?.summary?.totalProperties || 0}</div>
                            </div>
                            <div className="stat-card">
                                <h3>Active Properties</h3>
                                <div className="stat-value">{dashboardData?.summary?.totalActiveProperties || 0}</div>
                            </div>
                            <div className="stat-card">
                                <h3>Total Reviews</h3>
                                <div className="stat-value">{dashboardData?.summary?.totalReviews || 0}</div>
                            </div>
                            <div className="stat-card">
                                <h3>Average Views</h3>
                                <div className="stat-value">{dashboardData?.summary?.averageViewsPerProperty || 0}</div>
                            </div>
                        </div>

                        <div className="plan-distribution">
                            <h3>Plan Distribution</h3>
                            <div className="plan-chart">
                                {Object.entries(dashboardData?.planDistribution || {}).map(([plan, count]) => (
                                    <div key={plan} className="plan-item">
                                        <span className="plan-name">{plan}</span>
                                        <span className="plan-count">{count}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="recent-activity">
                            <h3>Recent Properties</h3>
                            <div className="activity-list">
                                {dashboardData?.recentActivity?.recentProperties?.map(property => (
                                    <div key={property.id} className="activity-item">
                                        <span className="property-name">{property.name}</span>
                                        <span className="property-date">{new Date(property.createdAt).toLocaleDateString()}</span>
                                        <span className="property-views">{property.views} views</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'properties' && (
                    <div className="properties-tab">
                        <div className="tab-header">
                            <h2>Property Management</h2>
                            <div className="bulk-actions">
                                <button 
                                    onClick={() => handleBulkOperation('suspend', 'properties', [])}
                                    className="btn btn-warning"
                                >
                                    ⏸️ Bulk Suspend
                                </button>
                                <button 
                                    onClick={() => handleBulkOperation('reactivate', 'properties', [])}
                                    className="btn btn-success"
                                >
                                    ▶️ Bulk Activate
                                </button>
                            </div>
                        </div>

                        <div className="properties-table">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Property Name</th>
                                        <th>Owner</th>
                                        <th>Status</th>
                                        <th>Views</th>
                                        <th>Created</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {properties.map(property => (
                                        <tr key={property._id}>
                                            <td>{property.name}</td>
                                            <td>{property.ownerInfo?.email || 'N/A'}</td>
                                            <td>
                                                <span className={`status ${property.isActive ? 'active' : 'inactive'}`}>
                                                    {property.isActive ? 'Active' : 'Inactive'}
                                                </span>
                                            </td>
                                            <td>{property.views}</td>
                                            <td>{new Date(property.createdAt).toLocaleDateString()}</td>
                                            <td>
                                                <button className="btn btn-sm btn-primary">View</button>
                                                <button className="btn btn-sm btn-warning">Suspend</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'users' && (
                    <div className="users-tab">
                        <div className="tab-header">
                            <h2>User Management</h2>
                            <div className="bulk-actions">
                                <button 
                                    onClick={() => handleBulkOperation('suspend', 'users', [])}
                                    className="btn btn-warning"
                                >
                                    ⏸️ Bulk Suspend
                                </button>
                                <button 
                                    onClick={() => handleBulkOperation('reactivate', 'users', [])}
                                    className="btn btn-success"
                                >
                                    ▶️ Bulk Activate
                                </button>
                            </div>
                        </div>

                        <div className="users-table">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Email</th>
                                        <th>Role</th>
                                        <th>Plan</th>
                                        <th>Properties</th>
                                        <th>Joined</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.map(user => (
                                        <tr key={user._id}>
                                            <td>{user.email}</td>
                                            <td>{user.role}</td>
                                            <td>{user.currentPlan?.type || 'Free'}</td>
                                            <td>{user.propertyStats?.total || 0}</td>
                                            <td>{new Date(user.createdAt).toLocaleDateString()}</td>
                                            <td>
                                                <button className="btn btn-sm btn-primary">View</button>
                                                <button className="btn btn-sm btn-warning">Suspend</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'analytics' && (
                    <div className="analytics-tab">
                        <h2>System Analytics</h2>
                        
                        <div className="analytics-grid">
                            <div className="analytics-card">
                                <h3>Property Growth</h3>
                                <div className="analytics-value">
                                    {analytics?.properties?.growth || 'N/A'}
                                </div>
                            </div>
                            
                            <div className="analytics-card">
                                <h3>User Growth</h3>
                                <div className="analytics-value">
                                    {analytics?.users?.growth || 'N/A'}
                                </div>
                            </div>
                            
                            <div className="analytics-card">
                                <h3>Occupancy Rate</h3>
                                <div className="analytics-value">
                                    {analytics?.occupancy?.average || 'N/A'}%
                                </div>
                            </div>
                        </div>

                        <div className="export-section">
                            <h3>Data Export</h3>
                            <div className="export-buttons">
                                <button onClick={() => handleExportData('properties', 'json')} className="btn btn-primary">
                                    Export Properties (JSON)
                                </button>
                                <button onClick={() => handleExportData('users', 'json')} className="btn btn-primary">
                                    Export Users (JSON)
                                </button>
                                <button onClick={() => handleExportData('analytics', 'json')} className="btn btn-primary">
                                    Export Analytics (JSON)
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
};

export default AdminDashboard;
