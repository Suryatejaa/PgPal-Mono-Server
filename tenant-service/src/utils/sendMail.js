const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
dotenv.config();

async function generateRentBillPDF(tenant, property, rentPaid, rentPaidDate) {
    return new Promise((resolve, reject) => {
        const tmpDir = path.join(__dirname, '../../../tmp');
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
        }
        const filePath = path.join(tmpDir, `Rent-Receipt-${tenant.pgpalId}-${Date.now()}.pdf`);
        const doc = new PDFDocument({
            margin: 50,
            size: 'A4',
            bufferPages: true
        });

        const stream = fs.createWriteStream(filePath);
        doc.pipe(stream);

        // Define colors and styles
        const primaryColor = '#4B0082';
        const secondaryColor = '#6A5ACD';
        const textColor = '#2C2C2C';
        const lightGray = '#F8F9FA';
        const borderColor = '#E1E5E9';

        // Page dimensions
        const pageWidth = doc.page.width;
        const pageHeight = doc.page.height;
        const margin = 50;
        const contentWidth = pageWidth - (margin * 2);

        // Helper function to draw horizontal line
        function drawLine(y, color = borderColor, lineWidth = 0.5) {
            doc.strokeColor(color)
                .lineWidth(lineWidth)
                .moveTo(margin, y)
                .lineTo(pageWidth - margin, y)
                .stroke();
        }

        // Helper function to create table row
        function createTableRow(y, col1, col2, isHeader = false) {
            const rowHeight = 25;
            const col1Width = contentWidth * 0.6;
            const col2Width = contentWidth * 0.4;

            if (isHeader) {
                // Header background
                doc.rect(margin, y - 2, contentWidth, rowHeight)
                    .fillColor(lightGray)
                    .fill();
            }

            doc.fillColor(isHeader ? primaryColor : textColor)
                .fontSize(isHeader ? 11 : 10)
                .font(isHeader ? 'Helvetica-Bold' : 'Helvetica')
                .text(col1, margin + 10, y + 6, { width: col1Width - 20 })
                .text(col2, margin + col1Width + 10, y + 6, { width: col2Width - 20 });

            // Draw borders
            doc.strokeColor(borderColor)
                .lineWidth(0.5)
                .rect(margin, y - 2, col1Width, rowHeight)
                .stroke()
                .rect(margin + col1Width, y - 2, col2Width, rowHeight)
                .stroke();

            return y + rowHeight;
        }

        // HEADER SECTION
        const headerHeight = 120;
        const headerPadding = 20;
        let currentY = headerPadding;

        // Company Header with background
        doc.rect(0, 0, pageWidth, headerHeight)
            .fillColor('#F8F9FA')
            .fill();

        try {
            // Logo and company info - centered vertically in header
            const logoY = headerPadding + 10;
            doc.image(path.join(__dirname, 'purplepg-logo.png'), margin, logoY, { width: 50 })
                .fillColor(primaryColor)
                .fontSize(24)
                .font('Helvetica-Bold')
                .text('Purple PG', margin + 65, logoY + 5)
                .fillColor(textColor)
                .fontSize(10)
                .font('Helvetica')
                .text('Professional PG Management Solutions', margin + 65, logoY + 32)
                .text('www.purplepg.com', margin + 65, logoY + 45);
        } catch (e) {
            // If logo missing, skip image
            const logoY = headerPadding + 10;
            doc.fillColor(primaryColor)
                .fontSize(24)
                .font('Helvetica-Bold')
                .text('Purple PG', margin, logoY + 5)
                .fillColor(textColor)
                .fontSize(10)
                .font('Helvetica')
                .text('Professional PG Management Solutions', margin, logoY + 32)
                .text('www.purplepg.com', margin, logoY + 45);
        }

        // Receipt number and date (right aligned) - centered vertically in header
        const receiptNumber = `RPT-${tenant.pgpalId}-${Date.now().toString().slice(-6)}`;
        const receiptText = `Receipt No: ${receiptNumber}`;
        const dateText = `Date: ${new Date(rentPaidDate).toLocaleDateString('en-IN')}`;

        // Calculate text width to prevent overlap
        const textWidth = Math.max(
            doc.widthOfString(receiptText, { fontSize: 10 }),
            doc.widthOfString(dateText, { fontSize: 10 })
        ) + 10;

        const receiptY = headerPadding + 20;
        doc.fillColor(textColor)
            .fontSize(10)
            .font('Helvetica')
            .text(receiptText, pageWidth - textWidth - margin, receiptY, { width: textWidth, align: 'right' })
            .text(dateText, pageWidth - textWidth - margin, receiptY + 18, { width: textWidth, align: 'right' });

        currentY = headerHeight + 10;

        // DOCUMENT TITLE
        doc.fillColor(primaryColor)
            .fontSize(20)
            .font('Helvetica-Bold')
            .text('RENT PAYMENT RECEIPT', margin, currentY, { width: contentWidth, align: 'center' });

        currentY += 40;
        drawLine(currentY, primaryColor, 1);
        currentY += 20;

        // PROPERTY DETAILS SECTION
        doc.fillColor(primaryColor)
            .fontSize(14)
            .font('Helvetica-Bold')
            .text('PROPERTY INFORMATION', margin, currentY);

        currentY += 25;

        const propertyDetails = [
            ['Property Name', property.name || 'N/A'],
            ['Property ID', property.pgpalId || 'N/A'],
            ['Address', formatAddress(property.address)],
            ['Monthly Rent', formatCurrency(property.rent || tenant.currentStay?.rent)]
        ];

        propertyDetails.forEach((detail, index) => {
            currentY = createTableRow(currentY, detail[0], detail[1], index === 0);
        });

        currentY += 25;

        // TENANT DETAILS SECTION
        doc.fillColor(primaryColor)
            .fontSize(14)
            .font('Helvetica-Bold')
            .text('TENANT INFORMATION', margin, currentY);

        currentY += 25;

        const tenantDetails = [
            ['Tenant Name', tenant.name || 'N/A'],
            ['Tenant ID', tenant.pgpalId || 'N/A'],
            ['Phone Number', tenant.phone || 'N/A'],
            ['Bed/Room ID', tenant.currentStay?.bedId || 'N/A']
        ];

        tenantDetails.forEach((detail, index) => {
            currentY = createTableRow(currentY, detail[0], detail[1], index === 0);
        });

        currentY += 25;

        // PAYMENT DETAILS SECTION
        doc.fillColor(primaryColor)
            .fontSize(14)
            .font('Helvetica-Bold')
            .text('PAYMENT DETAILS', margin, currentY);

        currentY += 25;

        function formatCurrency(amount) {
            if (!amount || amount === 'N/A') return 'N/A';
            // Clean the amount - remove any non-numeric characters except decimal point
            const cleanAmount = String(amount).replace(/[^\d.]/g, '');
            const numAmount = parseFloat(cleanAmount);
            if (isNaN(numAmount)) return 'N/A';
            return `₹ ${numAmount.toLocaleString('en-IN')}`;
        }
        
        const paymentDetails = [
            ['Amount Paid', formatCurrency(rentPaid)],
            ['Payment Date', new Date(rentPaidDate).toLocaleDateString('en-IN')],
            ['Payment Status', tenant.currentStay?.rentPaidStatus || 'Paid'],
            ['Payment Method', tenant.currentStay?.rentPaidMethod || 'N/A'],
            ['Transaction ID', tenant.currentStay?.rentPaidTransactionId || 'N/A']
        ];

        paymentDetails.forEach((detail, index) => {
            currentY = createTableRow(currentY, detail[0], detail[1], index === 0);
        });

        currentY += 30;

        // AMOUNT IN WORDS
        const amountInWords = convertNumberToWords(rentPaid);
        doc.fillColor(textColor)
            .fontSize(11)
            .font('Helvetica-Bold')
            .text('Amount in Words: ', margin, currentY)
            .font('Helvetica')
            .text(amountInWords, margin + 100, currentY);

        currentY += 30;

        // SIGNATURE SECTION
        drawLine(currentY, borderColor);
        currentY += 20;

        doc.fillColor(textColor)
            .fontSize(10)
            .font('Helvetica')
            .text('Authorized Signature', margin, currentY)
            .text('Purple PG Management', pageWidth - 200, currentY, { width: 150, align: 'right' });

        // FOOTER
        const footerY = pageHeight - 80;
        drawLine(footerY, borderColor);

        doc.fillColor('#666666')
            .fontSize(9)
            .font('Helvetica')
            .text('This is a computer-generated receipt and does not require a physical signature.',
                margin, footerY + 15, { width: contentWidth, align: 'center' })
            .text('For any queries or support, please contact us at support@purplepg.com',
                margin, footerY + 30, { width: contentWidth, align: 'center' })
            .text('Purple PG - Making PG Management Simple and Efficient',
                margin, footerY + 45, { width: contentWidth, align: 'center' });

        // Add page numbers if needed
        const pageCount = doc.bufferedPageRange().count;
        for (let i = 0; i < pageCount; i++) {
            doc.switchToPage(i);
            doc.fillColor('#666666')
                .fontSize(8)
                .text(`Page ${i + 1} of ${pageCount}`,
                    pageWidth - 100, pageHeight - 30, { width: 50, align: 'right' });
        }

        doc.end();

        stream.on('finish', () => resolve(filePath));
        stream.on('error', reject);
    });

    // Helper function to format address
    function formatAddress(address) {
        if (!address) return 'N/A';
        if (typeof address === 'string') return address;
        if (typeof address === 'object') {
            return address.full ||
                address.line1 ||
                `${address.street || ''} ${address.city || ''} ${address.state || ''}`.trim() ||
                'N/A';
        }
        return 'N/A';
    }

    // Helper function to format currency
    

    // Helper function to convert number to words (basic implementation)
    function convertNumberToWords(num) {
        const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
        const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
        const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];

        if (num === 0) return 'Zero Rupees Only';

        let result = '';
        const numStr = num.toString();

        if (num >= 100000) {
            const lakhs = Math.floor(num / 100000);
            result += ones[lakhs] + ' Lakh ';
            num %= 100000;
        }

        if (num >= 1000) {
            const thousands = Math.floor(num / 1000);
            if (thousands >= 20) {
                result += tens[Math.floor(thousands / 10)] + ' ';
                if (thousands % 10 > 0) result += ones[thousands % 10] + ' ';
            } else if (thousands >= 10) {
                result += teens[thousands - 10] + ' ';
            } else if (thousands > 0) {
                result += ones[thousands] + ' ';
            }
            result += 'Thousand ';
            num %= 1000;
        }

        if (num >= 100) {
            result += ones[Math.floor(num / 100)] + ' Hundred ';
            num %= 100;
        }

        if (num >= 20) {
            result += tens[Math.floor(num / 10)] + ' ';
            if (num % 10 > 0) result += ones[num % 10] + ' ';
        } else if (num >= 10) {
            result += teens[num - 10] + ' ';
        } else if (num > 0) {
            result += ones[num] + ' ';
        }

        return (result.trim() + ' Rupees Only').replace(/\s+/g, ' ');
    }
}
const sendMail = async ({ to, subject, text, attachments }) => {
    const transporter = nodemailer.createTransport({
        port: 587,
        secureConnection: false,
        service: 'gmail',
        host: 'smtp.gmail.com',
        auth: {
            user: process.env.EMAIL,
            pass: process.env.EMAIL_PASSWORD,
        },
    });

    const mailOptions = {
        from: process.env.EMAIL,
        to,
        subject,
        text,
        attachments,
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        return true;
    } catch (error) {
        console.error('Email send error:', error);
        return false;
    }
};

module.exports = { sendMail, generateRentBillPDF };