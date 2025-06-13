const moment = require('moment');

class AdminAnalytics {
    // Calculate trends over time periods
    static calculateTrend(currentValue, previousValue) {
        if (previousValue === 0) return currentValue > 0 ? 100 : 0;
        return ((currentValue - previousValue) / previousValue * 100).toFixed(2);
    }

    // Format large numbers for display
    static formatNumber(num) {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        }
        if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return num.toString();
    }

    // Generate time-based analytics
    static generateTimeBasedQuery(period = '30d') {
        const now = moment();
        let startDate;

        switch (period) {
            case '7d':
                startDate = now.clone().subtract(7, 'days');
                break;
            case '30d':
                startDate = now.clone().subtract(30, 'days');
                break;
            case '90d':
                startDate = now.clone().subtract(90, 'days');
                break;
            case '1y':
                startDate = now.clone().subtract(1, 'year');
                break;
            default:
                startDate = now.clone().subtract(30, 'days');
        }

        return {
            createdAt: { $gte: startDate.toDate() }
        };
    }

    // Calculate occupancy trends
    static calculateOccupancyTrend(rooms) {
        const timeframes = ['7d', '30d', '90d'];
        const trends = {};

        timeframes.forEach(period => {
            const query = this.generateTimeBasedQuery(period);
            const filteredRooms = rooms.filter(room =>
                room.createdAt >= query.createdAt.$gte
            );

            trends[period] = {
                totalRooms: filteredRooms.length,
                occupiedBeds: filteredRooms.reduce((acc, room) =>
                    acc + room.beds.filter(bed => bed.status === 'occupied').length, 0
                ),
                totalBeds: filteredRooms.reduce((acc, room) => acc + room.totalBeds, 0)
            };
        });

        return trends;
    }

    // Generate performance metrics
    static generatePerformanceMetrics(data) {
        return {
            efficiency: data.occupiedBeds / data.totalBeds * 100,
            utilization: data.occupiedRooms / data.totalRooms * 100,
            averageOccupancyPerRoom: data.occupiedBeds / data.totalRooms,
            revenuePerBed: data.totalRevenue / data.totalBeds,
            revenuePerRoom: data.totalRevenue / data.totalRooms
        };
    }

    // Format currency
    static formatCurrency(amount, currency = 'INR') {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(amount);
    }

    // Generate date ranges for analytics
    static getDateRanges() {
        const now = moment();
        return {
            today: {
                start: now.clone().startOf('day').toDate(),
                end: now.clone().endOf('day').toDate()
            },
            yesterday: {
                start: now.clone().subtract(1, 'day').startOf('day').toDate(),
                end: now.clone().subtract(1, 'day').endOf('day').toDate()
            },
            thisWeek: {
                start: now.clone().startOf('week').toDate(),
                end: now.clone().endOf('week').toDate()
            },
            lastWeek: {
                start: now.clone().subtract(1, 'week').startOf('week').toDate(),
                end: now.clone().subtract(1, 'week').endOf('week').toDate()
            },
            thisMonth: {
                start: now.clone().startOf('month').toDate(),
                end: now.clone().endOf('month').toDate()
            },
            lastMonth: {
                start: now.clone().subtract(1, 'month').startOf('month').toDate(),
                end: now.clone().subtract(1, 'month').endOf('month').toDate()
            }
        };
    }

    // Calculate growth rates
    static calculateGrowthRate(current, previous, period = 'month') {
        if (previous === 0) return current > 0 ? '∞' : '0';
        const growth = ((current - previous) / previous * 100).toFixed(1);
        return `${growth > 0 ? '+' : ''}${growth}%`;
    }

    // Generate aggregation pipeline for time-series data
    static getTimeSeriesAggregation(groupBy = 'day', dateField = 'createdAt') {
        const dateFormat = {
            day: '%Y-%m-%d',
            week: '%Y-W%U',
            month: '%Y-%m',
            year: '%Y'
        };

        return [
            {
                $group: {
                    _id: {
                        $dateToString: {
                            format: dateFormat[groupBy],
                            date: `$${dateField}`
                        }
                    },
                    count: { $sum: 1 },
                    items: { $push: '$$ROOT' }
                }
            },
            { $sort: { '_id': 1 } }
        ];
    }

    // Aggregate time series data
    static aggregateTimeSeries(data, groupBy = 'day') {
        if (!Array.isArray(data) || data.length === 0) {
            return [];
        }

        const groupedData = {};

        data.forEach(item => {
            let dateKey;
            const itemDate = moment(item.date || item.timestamp || item.createdAt);

            switch (groupBy) {
                case 'hour':
                    dateKey = itemDate.format('YYYY-MM-DD HH:00');
                    break;
                case 'day':
                    dateKey = itemDate.format('YYYY-MM-DD');
                    break;
                case 'week':
                    dateKey = itemDate.startOf('week').format('YYYY-MM-DD');
                    break;
                case 'month':
                    dateKey = itemDate.format('YYYY-MM');
                    break;
                default:
                    dateKey = itemDate.format('YYYY-MM-DD');
            }

            if (!groupedData[dateKey]) {
                groupedData[dateKey] = {
                    date: dateKey,
                    count: 0,
                    value: 0,
                    items: []
                };
            }

            groupedData[dateKey].count += 1;
            groupedData[dateKey].value += item.value || item.amount || 1;
            groupedData[dateKey].items.push(item);
        });

        return Object.values(groupedData).sort((a, b) =>
            new Date(a.date) - new Date(b.date)
        );
    }

    // Get advanced analytics with custom metrics and grouping
    static getAdvancedAnalytics(options = {}) {
        try {
            const { groupBy = 'property', timeframe = '30d', metrics = ['occupancy', 'revenue'] } = options;

            // Mock advanced analytics data
            const advancedData = {
                groupBy,
                timeframe,
                metrics,
                data: this.generateMockAnalyticsData(groupBy, metrics),
                summary: {
                    totalDataPoints: 50,
                    averageValue: 75.5,
                    trend: 'increasing',
                    trendPercentage: 12.5
                },
                timestamp: new Date()
            };

            return advancedData;
        } catch (error) {
            console.error('Error generating advanced analytics:', error);
            throw error;
        }
    }

    // Get performance insights
    static getPerformanceInsights(timeframe = '30d') {
        try {
            const insights = {
                timeframe,
                systemPerformance: {
                    responseTime: {
                        average: 150,
                        p95: 250,
                        p99: 400
                    },
                    throughput: {
                        requestsPerSecond: 45,
                        requestsPerMinute: 2700,
                        requestsPerHour: 162000
                    },
                    errorRate: 0.5,
                    uptime: 99.9
                },
                userActivity: {
                    totalUsers: 125,
                    activeUsers: 89,
                    peakConcurrency: 35,
                    averageSessionDuration: 1250
                },
                resourceUtilization: {
                    cpu: 35.5,
                    memory: 68.2,
                    storage: 45.8,
                    network: 22.1
                },
                recommendations: [
                    'Consider optimizing database queries for better response times',
                    'Monitor memory usage as it approaches 70% threshold',
                    'Review error logs for pattern analysis'
                ],
                timestamp: new Date()
            };

            return insights;
        } catch (error) {
            console.error('Error generating performance insights:', error);
            throw error;
        }
    }

    // Get occupancy forecast
    static getOccupancyForecast(period = '30d') {
        try {
            const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
            const forecast = [];

            for (let i = 0; i < days; i++) {
                const date = moment().add(i, 'days').format('YYYY-MM-DD');
                const baseOccupancy = 75; // Base occupancy rate
                const seasonalFactor = Math.sin((i / days) * Math.PI * 2) * 10;
                const randomFactor = (Math.random() - 0.5) * 15;

                forecast.push({
                    date,
                    predictedOccupancy: Math.max(0, Math.min(100,
                        baseOccupancy + seasonalFactor + randomFactor)),
                    confidence: Math.max(60, 95 - (i * 0.5)), // Confidence decreases over time
                    factors: {
                        seasonal: seasonalFactor,
                        historical: baseOccupancy,
                        uncertainty: Math.abs(randomFactor)
                    }
                });
            }

            return {
                period,
                forecast,
                summary: {
                    averagePredictedOccupancy: forecast.reduce((sum, day) => sum + day.predictedOccupancy, 0) / forecast.length,
                    trend: forecast[forecast.length - 1].predictedOccupancy > forecast[0].predictedOccupancy ? 'increasing' : 'decreasing',
                    averageConfidence: forecast.reduce((sum, day) => sum + day.confidence, 0) / forecast.length
                },
                timestamp: new Date()
            };
        } catch (error) {
            console.error('Error generating occupancy forecast:', error);
            throw error;
        }
    }

    // Helper method to generate mock analytics data
    static generateMockAnalyticsData(groupBy, metrics) {
        const data = [];
        const groups = groupBy === 'property' ? ['prop1', 'prop2', 'prop3'] :
            groupBy === 'type' ? ['single', 'double', 'triple'] :
                groupBy === 'floor' ? [1, 2, 3, 4] :
                    ['2024-05-01', '2024-05-02', '2024-05-03'];

        groups.forEach(group => {
            const item = { _id: group };

            if (metrics.includes('occupancy')) {
                item.occupancy = Math.floor(Math.random() * 40) + 60; // 60-100%
            }

            if (metrics.includes('revenue')) {
                item.revenue = Math.floor(Math.random() * 50000) + 30000; // 30k-80k
            }

            if (metrics.includes('growth')) {
                item.growth = (Math.random() - 0.5) * 30; // -15% to +15%
            }

            data.push(item);
        });

        return data;
    }
}

module.exports = AdminAnalytics;
