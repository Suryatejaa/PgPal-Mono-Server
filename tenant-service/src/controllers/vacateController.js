const { clearBed, assignBed } = require('./internalApis'); // Assuming you have a function to generate PPT IDs
const Vacates = require('../models/vacatesModel');
const Tenant = require('../models/tenantModel');


exports.raiseVacate = async (req, res) => {
    const currentUser = JSON.parse(req.headers['x-user']);
    const role = currentUser.data.user.role;

    if (role !== 'tenant') return res.status(403).json({ error: 'Only tenants can raise vacat request' });

    const pgpalId = currentUser.data.user.pgpalId;
    const phone = currentUser.data.user.phone;
    const _id = currentUser.data.user._id;
    const username = currentUser.data.user.username;

    const reason = req.body.reason;
    const isImmediateVacate = req.body.isImmediateVacate;


    try {
        const tenant = await Tenant.find({ $or: [{ phone }, { pgpalId }, { _id }] });
        if (!tenant || tenant.length === 0) return res.status(404).json({ error: 'Tenant not found' });

        const profile = tenant[0];
        if (profile.status === 'inactive') return res.status(400).json({ error: 'Tenant is already inactive' });
        if (profile.currentStay.isInNoticePeriod) return res.status(400).json({ error: 'Tenant is already in notice period' });
        const currentStay = profile.currentStay;
        const deposit = currentStay.deposit;

        let endMessage;
        if (isImmediateVacate && deposit) {
            endMessage = `You have to vacate immediately, and you may not be able to get INR:${deposit} your deposit back`;
        } else if (isImmediateVacate && !deposit) {
            return res.status(400).json({ error: 'You cannot vacate immediately without deposit, Please contact owner.' });
        } else if (!isImmediateVacate && deposit) {
            endMessage = `You have to vacate after notice period and you will get your INR:${deposit} deposit back after the vacate date`;
        } else if (!isImmediateVacate && !deposit) {
            endMessage = `You have to vacate after notice period and you will not get your deposit back after the vacate date`;
        } else {
            return res.status(400).json({ error: 'Invalid request' });
        }

        let d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        let closureNote;
        if (isImmediateVacate) {
            closureNote = 'Since its an immediate vacate, you can not withdraw the request post 24 hours';
        } else {
            closureNote = `You can withdraw the request before ${d.toDateString()}`;
        }

        const vacateDate = isImmediateVacate ? new Date() : new Date(Date.now() + currentStay.noticePeriodInMonths * 30 * 24 * 60 * 60 * 1000);

        const stayHistory = {
            propertyId: currentStay.propertyPpid,
            roomId: currentStay.roomPpid,
            bedId: currentStay.bedId,
            from: currentStay.assignedAt,
            to: vacateDate
        };

        currentStaySnapShot = {
            propertyId: currentStay.propertyPpid,
            roomId: currentStay.roomPpid,
            bedId: currentStay.bedId,
            rent: currentStay.rent,
            rentPaid: currentStay.rentPaid,
            rentDue: currentStay.rentDue,
            rentPaidDate: currentStay.rentPaidDate,
            rentDueDate: currentStay.rentDueDate,
            rentPaidStatus: currentStay.rentPaidStatus,
            rentPaidMethod: currentStay.rentPaidMethod,
            rentPaidTransactionId: currentStay.rentPaidTransactionId,
            nextRentDueDate: currentStay.nextRentDueDate,
            deposit: currentStay.deposit,
            assignedAt: currentStay.assignedAt,
            noticePeriodInMonths: currentStay.noticePeriodInMonths,
            isInNoticePeriod: currentStay.isInNoticePeriod
        };


        const updateProfile = {
            status: 'inactive',
            currentStay: {
                propertyPpid: null,
                roomPpid: null,
                bedId: null,
                rent: null,
                deposit: null,
                assignedAt: null,
                noticePeriodInMonths: 0,
                isInNoticePeriod: false
            },
            stayHistory: [...profile.stayHistory, stayHistory],
            isInNoticePeriod: true,
            noticePeriodStartDate: new Date(),
            noticePeriodEndDate: vacateDate,
            updatedAt: new Date()
        };

        const clearBedResponse = await clearBed(currentStay.roomPpid, currentStay.bedId, currentUser);
        if (!clearBedResponse) return res.status(400).json({
            error: 'Failed to clear bed',
            message: clearBedResponse
        });

        const updatedTenant = await Tenant.findByIdAndUpdate(tenant[0]._id, updateProfile, { new: true });
        if (!updatedTenant) return res.status(404).json({ error: 'Tenant not found' });


        const vacate = {
            tenantId: updatedTenant.pgpalId,
            propertyId: stayHistory.propertyId,
            roomId: stayHistory.roomId,
            bedId: stayHistory.bedId,
            isImmediateVacate: isImmediateVacate,
            vacateDate: vacateDate,
            noticePeriodStartDate: updatedTenant.noticePeriodStartDate,
            noticePeriodEndDate: updatedTenant.noticePeriodEndDate,
            reason: reason,
            status: isImmediateVacate ? 'completed' : 'noticeperiod',
            createdBy: username,
            previousSnapshot: currentStaySnapShot
        };

        const vacateRequest = await Vacates.create(vacate);
        if (!vacateRequest) return res.status(404).json({ error: 'Vacate request not created' });

        res.status(201).json({
            Comments: {
                message: 'Vacate request created successfully',
                closureNote: closureNote,
                Notes: endMessage,
            }, vacateRequest: vacateRequest
        });
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
};

exports.withdrawVacate = async (req, res) => {
    const currentUser = JSON.parse(req.headers['x-user']);
    const role = currentUser.data.user.role;

    if (role !== 'tenant') return res.status(403).json({ error: 'Only tenants can withdraw vacate request' });

    const pgpalId = currentUser.data.user.pgpalId;
    const phone = currentUser.data.user.phone;
    const _id = currentUser.data.user._id;

    try {
        const tenant = await Tenant.find({ $or: [{ phone }, { pgpalId }, { _id }] });
        if (!tenant || tenant.length === 0) return res.status(404).json({ error: 'Tenant not found' });

        const profile = tenant[0];
        const vacate = await Vacates.findOne({ tenantId: profile.pgpalId });
        if (!vacate) return res.status(404).json({ error: 'Vacate request not found' });
        if (vacate.removedByOwner) return res.status(400).json({ error: 'This tenant was removed by the owner, please check with owner' });
        
        if (!profile.isInNoticePeriod) return res.status(400).json({ error: 'Tenant is not in notice period' });
        
        const withdrawWindow = vacate.isImmediateVacate ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
        const currentTime = new Date().getTime();
        const vacateRaisedAtTime = new Date(vacate.vacateRaisedAt).getTime();
       
        const isWithdrawWindowOpen = currentTime - vacateRaisedAtTime <= withdrawWindow;
        if (!isWithdrawWindowOpen) return res.status(400).json({ error: 'Withdraw window is closed' });        
       
        if (vacate.status === 'withdrawn') return res.status(400).json({ error: 'Vacate request is already withdrawn' });
        if (vacate.status === 'completed' && !vacate.isImmediateVacate) return res.status(400).json({ error: 'Vacate request is already completed' });


        const previousSnapshot = vacate.previousSnapshot;
        const backupStay = {
            propertyPpid: previousSnapshot.propertyId,
            roomPpid: previousSnapshot.roomId,
            bedId: previousSnapshot.bedId,
            rent: previousSnapshot.rent,
            rentPaid: previousSnapshot.rentPaid,
            rentDue: previousSnapshot.rentDue,
            rentPaidDate: previousSnapshot.rentPaidDate,
            rentDueDate: previousSnapshot.rentDueDate,
            rentPaidStatus: previousSnapshot.rentPaidStatus,
            rentPaidMethod: previousSnapshot.rentPaidMethod,
            rentPaidTransactionId: previousSnapshot.rentPaidTransactionId,
            nextRentDueDate: previousSnapshot.nextRentDueDate,
            deposit: previousSnapshot.deposit,
            assignedAt: previousSnapshot.assignedAt,
            noticePeriodInMonths: previousSnapshot.noticePeriodInMonths,
            isInNoticePeriod: false,
            updatedAt: new Date()
        };


        const updateProfile = {
            status: 'active',
            currentStay: backupStay,
            isInNoticePeriod: false,
            noticePeriodStartDate: null,
            noticePeriodEndDate: null,
            updatedAt: new Date()
        };

        if (profile.stayHistory.length > 0) {
            const last = profile.stayHistory[profile.stayHistory.length - 1];
            if (last.to && new Date(last.to).getTime() === new Date(vacate.vacateDate).getTime()) {
                profile.stayHistory.pop();
            }
        }

        updateProfile.stayHistory = [...profile.stayHistory];

        const assignBedResponse = await assignBed(previousSnapshot.roomId, previousSnapshot.bedId, profile.phone, previousSnapshot.rent, pgpalId, currentUser);
        if (!assignBedResponse) return res.status(400).json({ error: 'Failed to assign bed' });

        const updatedTenant = await Tenant.findByIdAndUpdate(tenant[0]._id, updateProfile, { new: true });
        if (!updatedTenant) return res.status(404).json({ error: 'Tenant not found' });

        const updatedVacate = await Vacates.findByIdAndDelete(vacate._id, { new: true });
        if (!updatedVacate) return res.status(404).json({ error: 'Vacate request not found' });

        res.status(200).json({
            message: 'Vacate request withdrawn successfully',
            vacateRequest: updatedVacate
        });
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
};

