const Complaint = require('../models/complainsModel');
const { generateRITM } = require('../utils/idGenerator');
const { getTenantConfirmation } = require('./internalApis');
const { getPropertyOwner } = require('./internalApis');

module.exports = {
    async addComplaint(req, res) {
        const currentUser = JSON.parse(req.headers['x-user']);
        const role = currentUser.data.user.role;
        const id = currentUser.data.user._id;
        const ppid = currentUser.data.user.pgpalId;

        if (role !== 'tenant') {
            return res.status(403).json({ error: 'Forbidden: You do not have permission to add a complaint' });
        }

        let { tenantId, propertyId, complaintType, complaintOn, description } = req.body;

        if (!tenantId) tenantId = ppid;
        if (!propertyId || !complaintType || !description) {
            return res.status(400).json({ error: 'Property ID, complaint type, and description are required' });
        }

        const tenantConfirmation = await getTenantConfirmation(tenantId, currentUser);
        if (!tenantConfirmation) {
            return res.status(404).json({ error: 'Tenant not found' });
        }

        if (tenantConfirmation[0].status !== 'active') {
            return res.status(403).json({ error: 'Tenant is not active' });
        }
        if (propertyId !== tenantConfirmation[0].currentStay.propertyPpid) {
            return res.status(403).json({ error: 'Tenant is not staying in this property' });
        }

        const meta = complaintsMap[complaintType] || complaintsMap['Other'];

        if (meta) {
            complaintType = meta.type;
            description = meta.description;
        }
        if (!complaintType || !description) {
            return res.status(400).json({ error: 'Invalid complaint type or description' });
        }
        

        try {
            const complaint = await Complaint.create({
                complaintId: generateRITM(),
                tenantId,
                propertyId,
                complaintOn,
                complaintType,
                complaintMetadata: meta,
                status: 'Pending',
                createdBy: ppid,
                createdAt: Date.now(),
                description,
            });

            res.status(201).json(complaint);
        } catch (error) {
            res.status(500).json({ error: 'Failed to add complaint' });
        }
    },

    async getComplaints(req, res) {
        try {
            const { propertyId, tenantId, status } = req.query;
            const filter = {};
            if (propertyId) filter.propertyId = propertyId;
            if (tenantId) filter.tenantId = tenantId;
            if (status) filter.status = status;

            const complaints = await Complaint.find(filter).sort({ createdAt: -1 });
            res.status(200).json(complaints);
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch complaints' });
        }
    },

    async getComplaintById(req, res) {
        console.log(req.params.id);
        try {
            const complaint = await Complaint.findOne({ complaintId: req.params.id });
            if (!complaint) return res.status(404).json({ error: 'Complaint not found' });
            res.status(200).json(complaint);
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch complaint' });
        }
    },

    async updateComplaint(req, res) {
        const currentUser = JSON.parse(req.headers['x-user']);
        const ppid = currentUser.data.user.pgpalId;
        const id = currentUser.data.user._id;
        try {
            const complaint = await Complaint.findOne({ complaintId: req.params.id });
            if (!complaint) return res.status(404).json({ error: 'Complaint not found' });

            const confirmOwner = await getPropertyOwner(complaint.propertyId, currentUser);
            if (!confirmOwner) {
                return res.status(404).json({ error: 'Property not found' });
            }
            if (complaint.tenantId !== ppid && confirmOwner.ownerId !== id) {
                return res.status(403).json({ error: 'Forbidden: You do not have permission to update this complaint' });
            }
            if (complaint.status !== 'Pending') {
                return res.status(403).json({ error: 'Forbidden: You cannot update a complaint that is not pending' });
            }

            if (req.body.status && req.body.status !== complaint.status) {
                if (req.body.status === 'Resolved' && !req.body.notes) {
                    return res.status(400).json({ error: 'Notes are required when resolving a complaint' });
                }

                req.body.resolvedAt = Date.now();
                req.body.resolvedBy = ppid;

                if (req.body.notes) {
                    complaint.notes.push({
                        message: req.body.notes,
                        by: ppid
                    });
                }
            }

            const updatedComplaint = await Complaint.findOneAndUpdate(
                { complaintId: req.params.id },
                { $set: { ...req.body, updatedAt: Date.now() } },
                { new: true }
            );

            if (!updatedComplaint) return res.status(404).json({ error: 'Complaint not found' });

            res.status(200).json(updatedComplaint);
        } catch (error) {
            res.status(500).json({ error: 'Failed to update complaint' });
        }
    },

    async deleteComplaint(req, res) {
        const currentUser = JSON.parse(req.headers['x-user']);
        const ppid = currentUser.data.user.pgpalId;
        try {
            const complaint = await Complaint.findOne({ complaintId: req.params.id });
            if (!complaint) return res.status(404).json({ error: 'Complaint not found' });
            if (complaint.tenantId !== ppid) {
                return res.status(403).json({ error: 'Forbidden: You do not have permission to delete this complaint' });
            }
            const deletedComplaint = await Complaint.findOneAndDelete({ complaintId: req.params.id });
            if (!deletedComplaint) return res.status(404).json({ error: 'Complaint not found' });
            res.status(200).json({ message: 'Complaint deleted successfully' });
        } catch (error) {
            res.status(500).json({ error: 'Failed to delete complaint' });
        }
    },

    async getComplaintMetrics(req, res) {
        try {
            const totalComplaints = await Complaint.countDocuments();
            const pendingComplaints = await Complaint.countDocuments({ status: 'Pending' });
            const resolvedComplaints = await Complaint.countDocuments({ status: 'Resolved' });

            res.status(200).json({
                totalComplaints,
                pendingComplaints,
                resolvedComplaints
            });
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch complaint metrics' });
        }
    },

    async getComplaintMetricsByPropertyId(req, res) {
        try {
            const { propertyId } = req.params;

            const totalComplaints = await Complaint.countDocuments({ propertyId });
            const pendingComplaints = await Complaint.countDocuments({ propertyId, status: 'Pending' });
            const resolvedComplaints = await Complaint.countDocuments({ propertyId, status: 'Resolved' });

            res.status(200).json({
                propertyId,
                totalComplaints,
                pendingComplaints,
                resolvedComplaints
            });
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch complaint metrics for the property' });
        }
    }
};
