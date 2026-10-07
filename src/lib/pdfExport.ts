import { format } from 'date-fns';
import { es } from 'date-fns/locale';

/**
 * Carga diferida (lazy load) de jsPDF y jspdf-autotable.
 * Reduce ~400KB del bundle inicial, descargando la librería
 * ÚNICAMENTE cuando el usuario pulsa para exportar un PDF.
 */
async function loadPdfLibraries() {
  const [jsPdfModule, autoTableModule] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable')
  ]);

  const jsPDF = jsPdfModule.default;
  const autoTable = autoTableModule.default;

  return { jsPDF, autoTable };
}

export async function exportCustomerHistoryPDF(customer: any, payments: any[]) {
  if (!customer) return;

  const { jsPDF, autoTable } = await loadPdfLibraries();
  const doc = new jsPDF();
  const dateStr = new Date().toLocaleDateString();

  doc.setFontSize(20);
  doc.setTextColor(249, 115, 22);
  doc.text('ENERGYM FITNESS CENTER', 14, 20);

  doc.setFontSize(12);
  doc.setTextColor(30, 30, 36);
  doc.text(`HISTORIAL DE PAGOS: ${customer.customer_name.toUpperCase()}`, 14, 30);
  doc.setFontSize(10);
  doc.text(`Fecha de emisión: ${dateStr}`, 14, 37);

  let totalUSD = 0;
  let totalBs = 0;

  const tableRows = payments.map(p => {
    const pUSD = Number(p.amount) || 0;
    const pBs = Number(p.amount_bs) || 0;
    totalUSD += pUSD;
    totalBs += pBs;

    return [
      format(new Date(p.created_at), "dd/MM/yyyy", { locale: es }),
      p.payment_method || 'N/A',
      p.reference_number || '---',
      `$${pUSD.toLocaleString()}`,
      `Bs. ${pBs.toLocaleString()}`
    ];
  });

  tableRows.push([
    'TOTALES',
    '',
    '',
    `$${totalUSD.toLocaleString()}`,
    `Bs. ${totalBs.toLocaleString()}`
  ]);

  autoTable(doc, {
    startY: 45,
    head: [['Fecha', 'Método', 'Referencia', 'Monto (USD)', 'Monto (Bs)']],
    body: tableRows,
    theme: 'striped',
    headStyles: { fillColor: [249, 115, 22] },
    styles: { fontSize: 9 },
    columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' } },
    didParseCell: function (data: any) {
      if (data.row.index === tableRows.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.textColor = [249, 115, 22];
      }
    }
  });

  doc.save(`Historial_${customer.customer_name.replace(/\s+/g, '_')}_${dateStr}.pdf`);
}

interface FinancialReportOptions {
  filterPeriod: string;
  customStartDate?: string;
  customEndDate?: string;
  periodPaid: number;
  periodPaidBs: number;
  periodIngresoManual: number;
  totalPending: number;
  periodInvested: number;
  periodWithdrawn: number;
  periodNetCashFlow: number;
  filteredTransactions: any[];
  filteredPayments: any[];
}

export async function exportFinancialReportPDF(options: FinancialReportOptions) {
  const {
    filterPeriod,
    customStartDate,
    customEndDate,
    periodPaid,
    periodPaidBs,
    periodIngresoManual,
    totalPending,
    periodInvested,
    periodWithdrawn,
    periodNetCashFlow,
    filteredTransactions,
    filteredPayments
  } = options;

  const { jsPDF, autoTable } = await loadPdfLibraries();
  const doc = new jsPDF();
  const now = new Date();
  const dateStr = now.toLocaleDateString();
  const titlePeriod = filterPeriod === 'Personalizado' ? `${customStartDate} al ${customEndDate}` : filterPeriod.toUpperCase();

  // Título y Estilo del Reporte
  doc.setFontSize(20);
  doc.setTextColor(249, 115, 22); // Orange 500
  doc.text('ENERGYM FITNESS CENTER', 14, 20);

  doc.setFontSize(12);
  doc.setTextColor(30, 30, 36);
  doc.text(`REPORTE FINANCIERO: ${titlePeriod}`, 14, 30);
  doc.setFontSize(10);
  doc.text(`Fecha de emisión: ${dateStr}`, 14, 37);

  // Tabla 1: Resumen General del Período
  autoTable(doc, {
    startY: 45,
    head: [[`Indicador`, 'Monto']],
    body: [
      ['Ingresos en Período (Cobrados USD)', `$${periodPaid.toLocaleString()}`],
      ['Ingresos en Período (Cobrados Bs)', `Bs. ${periodPaidBs.toLocaleString()}`],
      ['Ingresos Manuales (Capital)', `$${periodIngresoManual.toLocaleString()}`],
      ['Cuentas por Cobrar (Global)', `$${totalPending.toLocaleString()}`],
      ['Inversiones en Período', `$${periodInvested.toLocaleString()}`],
      ['Gastos/Retiros en Período', `$${periodWithdrawn.toLocaleString()}`],
      ['SALDO NETO EN PERÍODO', `$${periodNetCashFlow.toLocaleString()}`],
    ],
    theme: 'grid',
    headStyles: { fillColor: [249, 115, 22], halign: 'center' },
    styles: { fontSize: 10, cellPadding: 5 },
    columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } }
  });

  // Tabla 2: Detalle de Movimientos del Período
  doc.setFontSize(12);
  let currentY = (doc as any).lastAutoTable.finalY + 15;
  doc.text(`MOVIMIENTOS MANUALES (${filteredTransactions.length})`, 14, currentY);

  const detailRows = filteredTransactions.map(t => [
    new Date(t.transaction_date).toLocaleDateString(),
    t.description,
    t.type.toUpperCase(),
    `$${Number(t.amount).toLocaleString()}`
  ]);

  autoTable(doc, {
    startY: currentY + 5,
    head: [['Fecha', 'Descripción', 'Categoría', 'Monto']],
    body: detailRows,
    theme: 'striped',
    headStyles: { fillColor: [39, 39, 42] },
    styles: { fontSize: 9 },
    columnStyles: { 3: { halign: 'right' } }
  });

  // Tabla 3: Detalle de Ingresos (Pagos de Miembros)
  currentY = (doc as any).lastAutoTable.finalY + 15;
  doc.text(`DETALLE DE INGRESOS - PAGOS DE MIEMBROS (${filteredPayments.length})`, 14, currentY);

  const paymentRows = filteredPayments.map(p => [
    new Date(p.created_at || p.payment_date).toLocaleDateString(),
    p.customer_name || 'Desconocido',
    p.payment_method || 'N/A',
    `$${Number(p.amount || 0).toLocaleString()}`,
    `Bs. ${Number(p.amount_bs || 0).toLocaleString()}`
  ]);

  paymentRows.push([
    'TOTALES',
    '',
    '',
    `$${periodPaid.toLocaleString()}`,
    `Bs. ${periodPaidBs.toLocaleString()}`
  ]);

  autoTable(doc, {
    startY: currentY + 5,
    head: [['Fecha', 'Cliente (Origen)', 'Método', 'Monto (USD)', 'Monto (Bs)']],
    body: paymentRows,
    theme: 'striped',
    headStyles: { fillColor: [16, 185, 129] },
    styles: { fontSize: 8 },
    columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' } },
    didParseCell: function (data: any) {
      if (data.row.index === paymentRows.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.textColor = [16, 185, 129];
      }
    }
  });

  doc.save(`Reporte_Financiero_Energym_${dateStr}.pdf`);
}
