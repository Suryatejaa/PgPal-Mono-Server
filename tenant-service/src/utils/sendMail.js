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
        const filePath = path.join(tmpDir, `Rent-bill-${tenant.pgpalId}-${Date.now()}.pdf`);
        const doc = new PDFDocument({ margin: 40 });

        const stream = fs.createWriteStream(filePath);
        doc.pipe(stream);

        // Header
        doc
            .image(path.join(__dirname, 'purplepg-logo.png'), 40, 30, { width: 60 }) // Optional: add your logo
            .fontSize(22)
            .fillColor('#4B0082')
            .text('Purple Pg', 110, 40, { align: 'left' })
            .fontSize(10)
            .fillColor('black')
            .text('www.purplepg.com', 110, 65, { align: 'left' });

        doc.moveDown(2);

        // Bill Title and Date
        doc
            .fontSize(18)
            .fillColor('#222')
            .text('Rent Payment Receipt', { align: 'center', underline: true });
        doc.moveDown(0.5);
        doc
            .fontSize(10)
            .fillColor('gray')
            .text(`Bill Date: ${new Date(rentPaidDate).toLocaleDateString()}`, { align: 'right' });

        doc.moveDown(1);

        // Property & Tenant Details
        doc
            .fontSize(12)
            .fillColor('#4B0082')
            .text('Property Details', { underline: true });
        doc
            .fontSize(10)
            .fillColor('black')
            .text(`Property Name: ${property.name}`)
            .text(`Property ID: ${property.pgpalId}`)
            .text(`Address: ${property.address?.full || property.address || 'N/A'}`)
            .moveDown(0.5);

        doc
            .fontSize(12)
            .fillColor('#4B0082')
            .text('Tenant Details', { underline: true });
        doc
            .fontSize(10)
            .fillColor('black')
            .text(`Tenant Name: ${tenant.name}`)
            .text(`Tenant ID: ${tenant.pgpalId}`)
            .text(`Phone: ${tenant.phone}`)
            .text(`Bed ID: ${tenant.currentStay.bedId || 'N/A'}`)
            .moveDown(1);

        // Payment Summary Table
        doc
            .fontSize(12)
            .fillColor('#4B0082')
            .text('Payment Summary', { underline: true });
        doc.moveDown(0.5);

        // Table-like layout
        const summary = [
            ['Description', 'Amount (₹)'],
            ['Monthly Rent', property.rent || tenant.currentStay.rent || 'N/A'],
            ['Paid Amount', rentPaid],
            ['Payment Date', new Date(rentPaidDate).toLocaleDateString()],
            ['Payment Status', tenant.currentStay.rentPaidStatus || 'N/A'],
            ['Payment Method', tenant.currentStay.rentPaidMethod || 'N/A'],
            ['Transaction ID', tenant.currentStay.rentPaidTransactionId || 'N/A'],
        ];
        const startX = 60, startY = doc.y, rowHeight = 20, colWidth = 220;
        doc.fontSize(10).fillColor('black');
        summary.forEach((row, i) => {
            doc.text(row[0], startX, startY + i * rowHeight, { continued: true, width: colWidth });
            doc.text(row[1], startX + colWidth + 30, startY + i * rowHeight);
        });

        doc.moveDown(4);

        // Footer
        doc
            .fontSize(9)
            .fillColor('gray')
            .text('This is a computer-generated bill from Purple Pg. For queries, contact support@purplepg.com', 40, 730, { align: 'center', width: 520 });

        doc.end();

        stream.on('finish', () => resolve(filePath));
        stream.on('error', reject);
    });
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
        attachments, // <-- add this line
    };

    console.log('PDF path:', attachments, to, process.env.EMAIL);
    try {
        const info = await transporter.sendMail(mailOptions);
        return true;
    } catch (error) {
        return false;
    }
};

module.exports = { sendMail, generateRentBillPDF };