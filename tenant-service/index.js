const express = require('express');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const cors = require('cors');
const tenantRoutes = require('./src/routes/tenantRoutes');
const paymentRoutes = require('./src/routes/paymentRoutes');
const monitorRoutes = require('./src/routes/monitoringRoutes');
const cookieParser = require('cookie-parser');
const VacateTenantsJob = require('./src/jobs/vacateTenantsJob');
const JobScheduler = require('./src/jobs/JobScheduler');
const RentReminderJob = require('./src/jobs/RentReminderJob');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 4004;

// Middleware
app.use(express.json());
// ...existing code...
const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps, Postman, curl)
        if (!origin) return callback(null, true);

        const allowedOrigins = [
            // Development origins
            'http://localhost:5173',
            'http://localhost:5174',
            'http://localhost:5175',
            'http://localhost:4000',
            'http://127.0.0.1:5173',
            'http://127.0.0.1:5174',
            'http://127.0.0.1:5175',
            'http://127.0.0.1:4000',

            // Production origins - CRITICAL FIX
            'https://purple-pgs.space',
            'https://www.purple-pgs.space',
            'https://api.purple-pgs.space',
            'https://owner.purple-pgs.space',
            'https://tenant.purple-pgs.space',
            'https://admin.purple-pgs.space',

            // Environment variable fallback
            process.env.FRONTEND_URL,
            process.env.CLIENT_URL
        ].filter(Boolean); // Remove undefined values

        console.log(`🌐 CORS Check - Origin: ${origin}, Allowed: ${allowedOrigins.includes(origin)}`);

        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            console.warn(`❌ CORS blocked origin: ${origin}`);
            callback(new Error(`CORS policy violation: Origin ${origin} not allowed`));
        }
    },
    credentials: true,
    optionsSuccessStatus: 200,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
        'Origin',
        'X-Requested-With',
        'Content-Type',
        'Accept',
        'Authorization',
        'Cookie',
        'Set-Cookie',
        'x-user',
        'x-internal-service',
        'x-debug',
        'Connection',
        'Upgrade'
    ],
    exposedHeaders: [
        'Authorization',
        'Refresh-Token',
        'Set-Cookie'
    ]
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// ...existing code...
app.use(cookieParser());

// Start the vacate tenants job
const jobScheduler = new JobScheduler();
jobScheduler.startAllJobs();

process.on('SIGTERM', () => {
    console.log('Shutting down gracefully...');
    jobScheduler.stopAllJobs();
    process.exit(0);
});

app.use('/api/tenant-service', tenantRoutes);
app.use('/api/rent-service', paymentRoutes);
app.use('/api/tenant-service/monitor', monitorRoutes);


app.post('/api/tenant-service/manual-vacate-job', async (req, res) => {
    try {
        const result = await jobScheduler.runJob('VacateTenantsJob');
        res.status(200).json({
            message: 'Manual vacate job executed successfully',
            result
        });
    } catch (error) {
        res.status(500).json({
            error: 'Manual vacate job failed',
            details: error.message
        });
    }
});

app.post('/debug/hello-job', async (req, res) => {
    try {
        const result = await jobScheduler.runJob('HelloWorldJob');
        res.json({ success: true, result });
    } catch (error) {
        res.json({ error: error.message });
    }
});

app.post('/api/tenant-service/debug/remind-tenant/:tenantId', async (req, res) => {
    try {
        const { tenantId } = req.params;
        const rentReminderJob = new RentReminderJob();
        const result = await rentReminderJob.runForTenant(tenantId);

        res.json({
            success: true,
            tenantId,
            result: result
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    tls: true,
    tlsAllowInvalidCertificates: false,
})
    .then(() => console.log('Connected to MongoDB'));
// Routes
app.get('/', (req, res) => {
    res.send('Tenant Service is running');
});

// Start the server
app.listen(PORT, () => {
    console.log(`Tenant Service is running on port ${PORT}`);
});
