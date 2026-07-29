// doGet:
//  - ?action=getData  -> คืนข้อมูลทั้งหมดเป็น JSON (ใช้เมื่อเปิดหน้าเว็บผ่าน GitHub Pages)
//  - ไม่มีพารามิเตอร์   -> เสิร์ฟหน้าเว็บ index (กรณีเปิดผ่าน Web app URL ของ GAS โดยตรง)
function doGet(e) {
  if (e && e.parameter && e.parameter.action === 'getData') {
    return ContentService
      .createTextOutput(JSON.stringify(getAppData()))
      .setMimeType(ContentService.MimeType.JSON);
  }
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('ระบบประเมิน IOC - I Care Hub')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// doPost: รับข้อมูลการประเมินจากหน้าเว็บ (fetch แบบ POST) แล้วบันทึกลงชีต
// body ที่คาดหวัง: { expertId, toolId, status, evals: [{itemId, score, comment}, ...] }
// ใช้ Content-Type: text/plain ฝั่ง client เพื่อเลี่ยง CORS preflight ที่ GAS ตอบไม่ได้
function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);
    const result = saveEvaluationData(req.expertId, req.toolId, req.status, req.evals || []);
    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, message: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ฟังก์ชันสร้างชีตบันทึกข้อมูล (Evaluations และ ToolStatus)
// และเพิ่มโครงสร้างชีต Experts / IOC_รวมทุกชุด หากเผลอลบไป
function setupDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // โครงสร้างชีตที่คุณมีอยู่ (ป้องกันการเผลอลบ จะได้สร้างใหม่ได้)
  const existingSheetsDef = {
    'Experts': ['Expert_ID', 'Full_Name', 'Position', 'Access_Token', 'Status', 'Started_At', 'Submitted_At'],
    'IOC_รวมทุกชุด': ['ลำดับ', 'ชุดที่', 'เครื่องมือ', 'ระยะ', 'วัตถุประสงค์', 'ตอน/ด้าน', 'ข้อที่', 'ข้อคำถาม / รายการประเมิน']
  };

  // ชีตระบบที่ต้องใช้เพิ่มสำหรับการทำงานของแอป
  const systemSheetsDef = {
    'Evaluations': ['Expert_ID', 'ชุดที่', 'ข้อที่', 'คะแนน', 'ข้อเสนอแนะ', 'Timestamp'],
    'ToolStatus': ['Expert_ID', 'ชุดที่', 'Status', 'Timestamp'],
    'Settings': ['Key', 'Value']
  };

  const allDefs = { ...existingSheetsDef, ...systemSheetsDef };

  for (let sheetName in allDefs) {
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.appendRow(allDefs[sheetName]);
      sheet.getRange(1, 1, 1, allDefs[sheetName].length).setFontWeight("bold").setBackground("#e0f2f1");
    }
  }

  // ใส่ค่าเริ่มต้นให้ชีต Settings หากยังว่าง (ใช้ควบคุมข้อความบนหน้าเว็บแบบไดนามิก)
  // แก้ค่าในคอลัมน์ Value ได้เลย แล้วหน้าเว็บจะเปลี่ยนตาม (ใช้ {name} แทนชื่อผู้ทรงฯ ได้)
  const settingsSheet = ss.getSheetByName('Settings');
  if (settingsSheet && settingsSheet.getLastRow() <= 1) {
    const defaults = [
      ['app_title', 'ระบบประเมินเครื่องมือวิจัย (IOC)'],
      ['app_title_short', 'IOC System'],
      ['welcome_title', 'ยินดีต้อนรับผู้ทรงคุณวุฒิ'],
      ['welcome_subtitle', 'กรุณาเลือกเครื่องมือวิจัยด้านล่างเพื่อทำการประเมิน IOC'],
      ['criteria_label', 'เกณฑ์การประเมิน:']
    ];
    settingsSheet.getRange(2, 1, defaults.length, 2).setValues(defaults);
  }
}

// ฟังก์ชัน Helper เพื่ออ่านข้อมูลในชีตมาเป็น Object Array
function getSheetDataAsObjects(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];

  const data = sheet.getDataRange().getDisplayValues(); // ใช้ getDisplayValues เผื่อรูปแบบตัวเลข
  if (data.length <= 1) return [];

  const headers = data.shift();
  return data.map(row => {
    let obj = {};
    headers.forEach((header, index) => {
      // ตัดช่องว่างหน้าหลังออกเพื่อป้องกัน error
      let safeHeader = header.toString().trim();
      obj[safeHeader] = row[index];
    });
    return obj;
  });
}

// อ่านชีตแบบตาราง (แถวแรก = หัวตาราง) เอาเฉพาะ numCols คอลัมน์แรก (A, B, C, ...)
// คืน { headers: [...], rows: [[...], ...] } ข้ามแถวที่ว่างทั้งแถว
function getSheetGrid(sheetName, numCols) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return { headers: [], rows: [] };

  const values = sheet.getDataRange().getDisplayValues();
  if (values.length === 0) return { headers: [], rows: [] };

  const take = r => r.slice(0, numCols).map(c => (c === null || c === undefined) ? '' : String(c));
  const headers = take(values[0]);
  const rows = values.slice(1)
    .map(take)
    .filter(r => r.some(c => c.trim() !== ''));
  return { headers: headers, rows: rows };
}

// ==========================================
// ฟังก์ชันหลักดึงข้อมูลไปแสดงผลบน Web App
// ==========================================
function getAppData() {
  // 1. ดึงผู้ทรงคุณวุฒิ จากชีต Experts
  const expertData = getSheetDataAsObjects('Experts');
  let experts = expertData.filter(e => e['Expert_ID'] && e['Expert_ID'].trim() !== "").map(e => ({
    id: e['Expert_ID'],
    name: e['Full_Name'] || e['Expert_ID']
  }));

  // 2. ดึงโครงสร้างเครื่องมือและคำถาม จากชีต IOC_รวมทุกชุด
  const iocData = getSheetDataAsObjects('IOC_รวมทุกชุด');

  let phasesSet = new Set();
  let toolsMap = new Map(); // Key: ชุดที่, Value: Tool Object
  let items = [];

  iocData.forEach(row => {
    const toolId = row['ชุดที่'];
    const phaseName = row['ระยะ'];
    const toolName = row['เครื่องมือ'];
    const itemId = row['ข้อที่'];
    const question = row['ข้อคำถาม / รายการประเมิน'];

    // ข้ามแถวว่าง
    if (!toolId || !itemId || !question) return;

    if (phaseName) phasesSet.add(phaseName);

    // เก็บข้อมูลเครื่องมือไม่ซ้ำ
    if (!toolsMap.has(toolId)) {
      toolsMap.set(toolId, {
        id: toolId,
        phaseId: phaseName || 'อื่นๆ',
        name: `${toolName || 'ไม่มีชื่อเครื่องมือ'}`
      });
    }

    // เก็บรายการคำถาม
    items.push({
      id: itemId,
      toolId: toolId,
      text: question,
      objective: row['วัตถุประสงค์'] || '-',
      part: row['ตอน/ด้าน'] || '-'
    });
  });

  // 2.1 ถ้ามีชีต "สรุปรายชุด" ให้ใช้เป็นรายการเครื่องมือหลัก
  //     คอลัมน์ A = ชุดที่ (ต้องตรงกับ "ชุดที่" ในชีต IOC_รวมทุกชุด เพื่อผูกกับคำถาม)
  //     คอลัมน์ B = ชื่อเครื่องมือ, C = ระยะ, D = รายละเอียด/หมายเหตุ
  const summaryGrid = getSheetGrid('สรุปรายชุด', 4);
  if (summaryGrid.rows.length > 0) {
    phasesSet = new Set();
    toolsMap = new Map();
    summaryGrid.rows.forEach(r => {
      const id = (r[0] || '').trim();
      if (!id) return;
      const name = (r[1] || '').trim();
      const phase = (r[2] || '').trim();
      const detail = (r[3] || '').trim();
      if (phase) phasesSet.add(phase);
      if (!toolsMap.has(id)) {
        toolsMap.set(id, {
          id: id,
          phaseId: phase || 'อื่นๆ',
          name: name || id,
          detail: detail
        });
      }
    });
  }

  const phases = Array.from(phasesSet).map(p => ({ id: p, label: p }));
  const tools = Array.from(toolsMap.values());

  // 3. ดึงสถานะเครื่องมือ จากชีต ToolStatus (Expert_ID, ชุดที่, Status)
  const statusData = getSheetDataAsObjects('ToolStatus');
  let toolStatuses = {};
  statusData.forEach(s => {
    const expertId = s['Expert_ID'];
    const toolId = s['ชุดที่'];
    if (!expertId || !toolId) return;

    if (!toolStatuses[expertId]) toolStatuses[expertId] = {};
    toolStatuses[expertId][toolId] = s['Status'];
  });

  // 4. ดึงคะแนนการประเมิน จากชีต Evaluations (Expert_ID, ชุดที่, ข้อที่, คะแนน, ข้อเสนอแนะ)
  const evalData = getSheetDataAsObjects('Evaluations');
  let evaluations = {};
  evalData.forEach(e => {
    const expertId = e['Expert_ID'];
    const toolId = e['ชุดที่'];
    const itemId = e['ข้อที่'];

    if (!expertId || !toolId || !itemId) return;

    let key = `${expertId}_${toolId}_${itemId}`;
    evaluations[key] = {
      score: e['คะแนน'] === "" ? null : parseInt(e['คะแนน'], 10),
      comment: e['ข้อเสนอแนะ'] || ""
    };
  });

  // 5. ดึงการตั้งค่าข้อความหน้าเว็บ จากชีต Settings (Key -> Value)
  const settingsData = getSheetDataAsObjects('Settings');
  let settings = {};
  settingsData.forEach(s => {
    const k = (s['Key'] || '').toString().trim();
    if (k) settings[k] = s['Value'];
  });

  // 6. ดึงส่วนคำชี้แจง และ วัตถุประสงค์และนิยาม (แถวแรก = หัวตาราง, คอลัมน์ A B C)
  const instructions = getSheetGrid('คำชี้แจง', 3);
  const definitions = getSheetGrid('วัตถุประสงค์และนิยาม', 3);

  return {
    experts: experts,
    phases: phases,
    tools: tools,
    items: items,
    toolStatuses: toolStatuses,
    evaluations: evaluations,
    settings: settings,
    instructions: instructions,
    definitions: definitions
  };
}

// ==========================================
// ฟังก์ชันบันทึกข้อมูลจากหน้าเว็บ
// ==========================================
function saveEvaluationData(expertId, toolId, status, evalsToSave) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const timestamp = new Date();

  // 1. อัปเดตชีต ToolStatus
  const statusSheet = ss.getSheetByName('ToolStatus');
  const statusData = statusSheet.getDataRange().getValues();
  let statusRowIndex = -1;

  // ค้นหาแถวเดิม (Expert_ID ตรงกับคอลัมน์ A, ชุดที่ ตรงกับคอลัมน์ B)
  for (let i = 1; i < statusData.length; i++) {
    if (statusData[i][0] == expertId && statusData[i][1] == toolId) {
      statusRowIndex = i + 1;
      break;
    }
  }

  if (statusRowIndex > -1) {
    statusSheet.getRange(statusRowIndex, 3).setValue(status);
    statusSheet.getRange(statusRowIndex, 4).setValue(timestamp);
  } else {
    statusSheet.appendRow([expertId, toolId, status, timestamp]);
  }

  // 2. อัปเดตชีต Evaluations
  const evalSheet = ss.getSheetByName('Evaluations');
  const evalDataAll = evalSheet.getDataRange().getValues();

  // สร้าง Index Map หาแถวอย่างรวดเร็ว: "ExpertID_ToolID_ItemID" -> RowIndex
  let evalRowMap = {};
  for (let i = 1; i < evalDataAll.length; i++) {
    let key = `${evalDataAll[i][0]}_${evalDataAll[i][1]}_${evalDataAll[i][2]}`;
    evalRowMap[key] = i + 1;
  }

  // evalsToSave = [{itemId, score, comment}, ...]
  evalsToSave.forEach(item => {
    let key = `${expertId}_${toolId}_${item.itemId}`;
    let rowIndex = evalRowMap[key];

    if (rowIndex) {
      // หากพบข้อมูลเดิม ให้แก้ไข
      evalSheet.getRange(rowIndex, 4).setValue(item.score); // คะแนน
      evalSheet.getRange(rowIndex, 5).setValue(item.comment); // ข้อเสนอแนะ
      evalSheet.getRange(rowIndex, 6).setValue(timestamp);
    } else {
      // หากไม่พบ ให้เพิ่มแถวใหม่
      evalSheet.appendRow([expertId, toolId, item.itemId, item.score, item.comment, timestamp]);
    }
  });

  return { success: true, message: "บันทึกข้อมูลเรียบร้อย" };
}
