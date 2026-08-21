(function () {
  'use strict';

  const store = window.BankrollStore;
  const resultLabels = { pending: 'Pendente', green: 'Green', red: 'Red', void: 'Void' };
  const colors = {
    dark: '111820', green: '34D378', greenSoft: 'E8F8EF', line: 'DCE3E8',
    text: '18212B', muted: '697681', red: 'D94C5C', yellow: 'D79B24', white: 'FFFFFF'
  };
  const currencyFormat = '"R$" #,##0.00;[Red]-"R$" #,##0.00;"R$" 0.00';
  const percentFormat = '0.00%;[Red]-0.00%;0.00%';

  const numeric = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
    const date = new Date(`${value}T12:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function localDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function chronological(entries) {
    return entries.map((entry, index) => ({ entry, index })).sort((a, b) => {
      const aKey = `${a.entry.date || '9999-99-99'}|${a.entry.createdAt || ''}`;
      const bKey = `${b.entry.date || '9999-99-99'}|${b.entry.createdAt || ''}`;
      return aKey.localeCompare(bKey) || a.index - b.index;
    }).map((item) => item.entry);
  }

  function groupEntries(entries, field) {
    const groups = new Map();
    entries.forEach((entry) => {
      const key = String(entry[field] || '').trim() || 'Não informado';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(entry);
    });
    return [...groups].map(([name, grouped]) => {
      const summary = store.calculate({ version: 1, initialBankroll: null, entries: grouped });
      return { name, entries: grouped, summary };
    }).sort((a, b) => b.summary.netProfit - a.summary.netProfit || b.entries.length - a.entries.length || a.name.localeCompare(b.name, 'pt-BR'));
  }

  function monthlyGroups(state) {
    const groups = new Map();
    let balance = state.initialBankroll;
    chronological(state.entries).forEach((entry) => {
      const date = validDate(entry.date);
      const key = date ? entry.date.slice(0, 7) : 'Sem data válida';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(entry);
      if (entry.result !== 'pending' && balance != null) balance += store.profit(entry);
      groups.get(key).endingBalance = balance;
    });
    return [...groups].map(([month, entries]) => ({
      month,
      entries,
      endingBalance: entries.endingBalance,
      summary: store.calculate({ version: 1, initialBankroll: null, entries })
    }));
  }

  function title(sheet, text, subtitle, lastColumn) {
    sheet.mergeCells(1, 1, 1, lastColumn);
    sheet.getCell(1, 1).value = text;
    sheet.getCell(1, 1).font = { name: 'Aptos Display', size: 18, bold: true, color: { argb: colors.white } };
    sheet.getCell(1, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.dark } };
    sheet.getCell(1, 1).alignment = { vertical: 'middle' };
    sheet.getRow(1).height = 31;
    sheet.mergeCells(2, 1, 2, lastColumn);
    sheet.getCell(2, 1).value = subtitle;
    sheet.getCell(2, 1).font = { name: 'Aptos', size: 9, color: { argb: colors.muted } };
    sheet.getRow(2).height = 21;
    sheet.views = [{ state: 'frozen', ySplit: 4, showGridLines: false }];
  }

  function styleHeader(row) {
    row.height = 23;
    row.eachCell((cell) => {
      cell.font = { name: 'Aptos', size: 9, bold: true, color: { argb: colors.white } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.dark } };
      cell.alignment = { vertical: 'middle', wrapText: true };
      cell.border = { bottom: { style: 'medium', color: { argb: colors.green } } };
    });
  }

  function setWidths(sheet, widths) {
    widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
  }

  function finishTable(sheet, headerRow, lastRow, lastColumn) {
    styleHeader(sheet.getRow(headerRow));
    if (lastRow > headerRow) {
      sheet.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: lastRow, column: lastColumn } };
      for (let row = headerRow + 1; row <= lastRow; row += 1) {
        sheet.getRow(row).height = 20;
        sheet.getRow(row).eachCell((cell) => {
          cell.font = { name: 'Aptos', size: 9, color: { argb: colors.text } };
          cell.alignment = { vertical: 'middle' };
          cell.border = { bottom: { style: 'hair', color: { argb: colors.line } } };
        });
      }
    }
  }

  function addSummary(workbook, state) {
    const sheet = workbook.addWorksheet('Resumo', { properties: { tabColor: { argb: colors.green } } });
    const summary = store.calculate(state);
    title(sheet, 'Central Pro | Minha Banca', `Resumo exportado em ${new Date().toLocaleString('pt-BR')}`, 4);
    sheet.getRow(4).values = ['Indicador', 'Valor', 'Indicador', 'Valor'];
    const rows = [
      ['Banca inicial', summary.initialBankroll, 'Banca atual', summary.currentBankroll],
      ['Lucro / Prejuízo', summary.netProfit, 'ROI', summary.roi / 100],
      ['Total apostado', summary.totalStake, 'Total liquidado', summary.settledStake],
      ['Odd média', summary.averageOdd, 'Taxa de acerto', summary.hitRate / 100],
      ['Greens', summary.counts.green, 'Reds', summary.counts.red],
      ['Voids', summary.counts.void, 'Pendentes', summary.counts.pending]
    ];
    rows.forEach((row) => sheet.addRow(row));
    styleHeader(sheet.getRow(4));
    setWidths(sheet, [23, 18, 23, 18]);
    [5, 6, 7].forEach((row) => { sheet.getCell(row, 2).numFmt = currencyFormat; });
    [5, 6, 7].forEach((row) => { if (row !== 6) sheet.getCell(row, 4).numFmt = currencyFormat; });
    sheet.getCell(6, 4).numFmt = percentFormat;
    sheet.getCell(8, 2).numFmt = '0.00'; sheet.getCell(8, 4).numFmt = percentFormat;
    for (let row = 5; row <= 10; row += 1) {
      for (let column = 1; column <= 4; column += 1) {
        const cell = sheet.getCell(row, column);
        cell.border = { bottom: { style: 'hair', color: { argb: colors.line } } };
        cell.alignment = { vertical: 'middle' };
      }
    }
    ['B6', 'B5', 'D5'].forEach((address) => { sheet.getCell(address).font = { bold: true, color: { argb: colors.green } }; });
    return sheet;
  }

  function addEntries(workbook, state) {
    const sheet = workbook.addWorksheet('Entradas');
    title(sheet, 'Entradas', 'Histórico completo em ordem cronológica', 10);
    sheet.getRow(4).values = ['Data', 'Competição', 'Partida', 'Mercado', 'Seleção', 'Odd', 'Stake', 'Resultado', 'Lucro / Prejuízo', 'Saldo após entrada'];
    let balance = state.initialBankroll;
    chronological(state.entries).forEach((entry) => {
      const settled = entry.result !== 'pending';
      const profit = settled ? store.profit(entry) : null;
      if (settled && balance != null) balance += profit;
      sheet.addRow([validDate(entry.date) || String(entry.date || ''), entry.competition || '', entry.match || '', entry.market || '', entry.selection || '', numeric(entry.odd), numeric(entry.stake), resultLabels[entry.result] || entry.result || '', profit, balance]);
    });
    setWidths(sheet, [13, 24, 31, 24, 28, 10, 15, 13, 19, 20]);
    finishTable(sheet, 4, sheet.rowCount, 10);
    for (let row = 5; row <= sheet.rowCount; row += 1) {
      if (sheet.getCell(row, 1).value instanceof Date) sheet.getCell(row, 1).numFmt = 'dd/mm/yyyy';
      sheet.getCell(row, 6).numFmt = '0.00';
      [7, 9, 10].forEach((column) => { sheet.getCell(row, column).numFmt = currencyFormat; });
      const result = sheet.getCell(row, 8).value;
      const tone = result === 'Green' ? colors.green : result === 'Red' ? colors.red : result === 'Pendente' ? colors.yellow : colors.muted;
      sheet.getCell(row, 8).font = { bold: true, color: { argb: tone } };
    }
    return sheet;
  }

  function addGroupedSheet(workbook, name, groups, label) {
    const sheet = workbook.addWorksheet(name);
    title(sheet, name, `Desempenho consolidado por ${label.toLowerCase()}`, 11);
    sheet.getRow(4).values = [label, 'Entradas', 'Greens', 'Reds', 'Voids', 'Pendentes', 'Total apostado', 'Lucro / Prejuízo', 'ROI', 'Taxa de acerto', 'Odd média'];
    groups.forEach(({ name: groupName, entries, summary }) => sheet.addRow([
      groupName, entries.length, summary.counts.green, summary.counts.red, summary.counts.void,
      summary.counts.pending, summary.totalStake, summary.netProfit, summary.roi / 100,
      summary.hitRate / 100, summary.averageOdd
    ]));
    setWidths(sheet, [31, 12, 11, 11, 11, 13, 18, 19, 12, 17, 13]);
    finishTable(sheet, 4, sheet.rowCount, 11);
    for (let row = 5; row <= sheet.rowCount; row += 1) {
      [7, 8].forEach((column) => { sheet.getCell(row, column).numFmt = currencyFormat; });
      [9, 10].forEach((column) => { sheet.getCell(row, column).numFmt = percentFormat; });
      sheet.getCell(row, 11).numFmt = '0.00';
    }
    return sheet;
  }

  function addMonthly(workbook, state) {
    const sheet = workbook.addWorksheet('Mensal');
    title(sheet, 'Mensal', 'Desempenho por mês das entradas registradas', 11);
    sheet.getRow(4).values = ['Mês', 'Entradas', 'Greens', 'Reds', 'Voids', 'Pendentes', 'Total apostado', 'Lucro / Prejuízo', 'ROI', 'Taxa de acerto', 'Banca final do mês'];
    monthlyGroups(state).forEach(({ month, entries, endingBalance, summary }) => sheet.addRow([
      /^\d{4}-\d{2}$/.test(month) ? `${month.slice(5, 7)}/${month.slice(0, 4)}` : month,
      entries.length, summary.counts.green, summary.counts.red, summary.counts.void,
      summary.counts.pending, summary.totalStake, summary.netProfit, summary.roi / 100,
      summary.hitRate / 100, endingBalance
    ]));
    setWidths(sheet, [18, 12, 11, 11, 11, 13, 18, 19, 12, 17, 21]);
    finishTable(sheet, 4, sheet.rowCount, 11);
    for (let row = 5; row <= sheet.rowCount; row += 1) {
      [7, 8, 11].forEach((column) => { sheet.getCell(row, column).numFmt = currencyFormat; });
      [9, 10].forEach((column) => { sheet.getCell(row, column).numFmt = percentFormat; });
    }
    return sheet;
  }

  function buildWorkbook(state) {
    if (!window.ExcelJS) throw new Error('Biblioteca de exportação indisponível.');
    const workbook = new window.ExcelJS.Workbook();
    workbook.creator = 'Central Pro';
    workbook.created = new Date();
    workbook.calcProperties.fullCalcOnLoad = true;
    addSummary(workbook, state);
    addEntries(workbook, state);
    addGroupedSheet(workbook, 'Por Mercado', groupEntries(state.entries, 'market'), 'Mercado');
    addGroupedSheet(workbook, 'Por Competição', groupEntries(state.entries, 'competition'), 'Competição');
    addMonthly(workbook, state);
    return workbook;
  }

  function updateAvailability(state = store.load()) {
    const button = document.getElementById('exportExcelButton');
    if (!button) return;
    button.disabled = state.initialBankroll == null && state.entries.length === 0;
    button.title = button.disabled ? 'Defina a banca ou registre uma entrada para exportar' : 'Baixar relatório em Excel';
  }

  async function exportExcel() {
    const button = document.getElementById('exportExcelButton');
    const state = store.load();
    if (state.initialBankroll == null && state.entries.length === 0) return;
    button.disabled = true; button.classList.add('is-loading'); button.textContent = 'Gerando Excel…';
    try {
      const workbook = buildWorkbook(state);
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Central-Pro-Minha-Banca-${localDateKey()}.xlsx`;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      console.error('Erro ao gerar Excel:', error);
      window.alert('Não foi possível gerar o Excel. Tente novamente.');
    } finally {
      button.classList.remove('is-loading'); button.textContent = 'Exportar Excel';
      updateAvailability(store.load());
    }
  }

  window.BankrollExport = { buildWorkbook, updateAvailability, exportExcel, chronological, groupEntries, monthlyGroups, localDateKey };
  document.getElementById('exportExcelButton')?.addEventListener('click', exportExcel);
}());
