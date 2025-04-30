const refreshRentForBilling = (currentStay) => {
    const { rent, rentPaidStatus, advanceBalance = 0, assignedAt } = currentStay;

    // If rent is unpaid, just return as-is. No cycle update.
    if (rentPaidStatus !== 'paid') {
        return currentStay;
    }

    // Calculate new rentDue using any advance balance
    const nextRentDue = rent - advanceBalance;
    const carryForward = nextRentDue < 0 ? Math.abs(nextRentDue) : 0;
    const actualNextRentDue = nextRentDue > 0 ? nextRentDue : 0;

    const assignedDate = new Date(assignedAt);
    const now = new Date();
    const nextMonth = new Date(now.setMonth(now.getMonth() + 1));
    const nextRentDueDate = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), assignedDate.getDate());
    
    return {
        ...currentStay,
        nextRentDue: actualNextRentDue,
        nextRentDueDate,
        advanceBalance: carryForward,
        isNextMonthBilled: true,
        updatedAt: new Date()
    };
};


module.exports = refreshRentForBilling;
