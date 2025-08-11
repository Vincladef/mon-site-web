// 📁 App Script – Complet & Réécrit

const CONFIG_SHEET_ID = '1D9M3IEPtD7Vbdt7THBvNm8CiQ3qdrelyR-EdgNmd6go';
const ANSWER_VALUES = {
  "oui": 1,
  "plutôt oui": 0.75,
  "moyen": 0.25,
  "non": -1,
  "plutôt non": 0,
  "pas de reponse": 0
};
const DELAYS = [0, 1, 2, 3, 5, 8, 13];
const JOURS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];

function clean(str) {
  return (str || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[\u00A0\u202F\u200B]/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

function getUserConfig(user) {
  const sheet = SpreadsheetApp.openById(CONFIG_SHEET_ID).getSheets()[0];
  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(h => h.toString().toLowerCase());
  for (let i = 1; i < data.length; i++) {
    const rowUser = (data[i][0] || "").toString().toLowerCase();
    if (rowUser === user.toLowerCase()) {
      const result = {};
      headers.forEach((h, j) => result[h] = data[i][j]);
      return result;
    }
  }
  return null;
}

function sendTelegramMessage(chatId, message, botToken) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ chat_id: chatId, text: message })
  };
  UrlFetchApp.fetch(url, options);
}

function sendAllTelegramReminders() {
  const configSheet = SpreadsheetApp.openById(CONFIG_SHEET_ID).getSheets()[0];
  const configData = configSheet.getDataRange().getValues();
  const headers = configData[0].map(h => h.toString().toLowerCase());
  const today = new Date();
  const refDayName = today.toLocaleDateString("fr-FR", { weekday: "long" }).toLowerCase();
  const formattedDate = Utilities.formatDate(today, "GMT+1", "dd/MM/yyyy");

  configData.slice(1).forEach(row => {
    const user = (row[0] || "").toString().toLowerCase();
    const chatId = row[headers.indexOf("chatid")];
    const botApi = row[headers.indexOf("api telegram")];
    const sheetUrl = row[headers.indexOf("sheet url")];
    const trackingUrl = row[headers.indexOf("url tracking")];
    if (!user || !chatId || !botApi || !sheetUrl || !trackingUrl) return;

    try {
      const ssId = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/)?.[1];
      const trackingSheet = SpreadsheetApp.openById(ssId).getSheetByName("Tracking");
      const headersTracking = trackingSheet.getRange(1, 1, 1, trackingSheet.getLastColumn()).getValues()[0];
      const data = trackingSheet.getRange(2, 1, trackingSheet.getLastRow() - 1, trackingSheet.getLastColumn()).getValues();

      let count = 0;
      data.forEach(row => {
        const freq = clean(row[3]);
        const isSpaced = freq.includes("repetition espacee") || freq.includes("répétition espacée");
        const isQuotidien = freq.includes("quotidien");
        const isMatchingDay = JOURS.some(j => freq.includes(j) && j === refDayName);

        let include = false;

        if (isSpaced) {
          let score = 0;
          let lastDate = null;
          for (let col = headersTracking.length - 1; col >= 5; col--) {
            const val = clean(row[col]);
            if (!val) continue;
            score += ANSWER_VALUES[val] ?? 0;

            const [d, m, y] = (headersTracking[col] || "").split("/");
            if (d && m && y) {
              const parsed = new Date(`${y}-${m}-${d}`);
              if (!lastDate || parsed > lastDate) lastDate = parsed;
            }
          }
          score = Math.max(0, Math.min(6, Math.round(score)));
          const delay = DELAYS[score];
          if (lastDate) {
            const next = new Date(lastDate);
            next.setDate(next.getDate() + delay);
            include = today >= next;
          } else include = true;
        }

        if (!isSpaced && (isQuotidien || isMatchingDay)) {
          include = true;
        }

        if (include) count++;
      });

      const botToken = botApi.replace("https://api.telegram.org/bot", "").split("/")[0];
      const message = count === 0
        ? `🎉 Hello ${user}, rien à remplir aujourd’hui !\n👉 ${trackingUrl}`
        : `📋 Hello ${user}, tu as ${count} chose(s) à traquer aujourd’hui (${formattedDate})\n👉 ${trackingUrl}`;

      sendTelegramMessage(chatId, message, botToken);
    } catch (e) {
      Logger.log(`Erreur pour ${user} : ${e}`);
    }
  });
}

function doPost(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Tracking');
  const data = JSON.parse(e.postData.contents);
  const selectedDate = data._date;
  if (!selectedDate) return ContentService.createTextOutput("❌ Date manquante").setMimeType(ContentService.MimeType.TEXT);
  const parsedDate = new Date(selectedDate);
  const dateStr = Utilities.formatDate(parsedDate, "GMT+1", "dd/MM/yyyy");
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  let dateColIndex = headers.indexOf(dateStr) + 1;
  if (dateColIndex === 0) {
    dateColIndex = headers.length + 1;
    sheet.getRange(1, dateColIndex).setValue(dateStr);
  }
  const targetIndex = 6;
  if (dateColIndex !== targetIndex) {
    sheet.insertColumnBefore(targetIndex);
    const lastRow = sheet.getLastRow();
    sheet.getRange(1, dateColIndex + 1, lastRow).moveTo(sheet.getRange(1, targetIndex, lastRow));
    sheet.deleteColumn(dateColIndex + 1);
  }
  const questions = sheet.getRange(2, 5, sheet.getLastRow() - 1).getValues().flat();
  for (let i = 0; i < questions.length; i++) {
    const label = questions[i];
    if (label && data[label] !== undefined && data[label] !== "") {
      sheet.getRange(i + 2, targetIndex).setValue(data[label]);
    }
  }
  return ContentService.createTextOutput("✅ Données enregistrées !").setMimeType(ContentService.MimeType.TEXT);
}

function doGet(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Tracking');
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  const queryDate = e?.parameter?.date;
  const referenceDate = queryDate ? new Date(queryDate) : new Date();
  const refDayName = referenceDate.toLocaleDateString("fr-FR", { weekday: "long" }).toLowerCase();

  // 🔁 On compare uniquement à "aujourd’hui" pour appliquer le skip
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  referenceDate.setHours(0, 0, 0, 0);
  const isToday = referenceDate.getTime() === today.getTime();
  const refDateOnly = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());

  function clean(str) {
    return (str || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[\u00A0\u202F\u200B]/g, " ")
      .replace(/\s+/g, " ")
      .toLowerCase()
      .trim();
  }

  function computeScoreAndLastDate(row) {
    let totalScore = 0;
    let lastDate = null;
    for (let col = headers.length - 1; col >= 5; col--) {
      const answer = clean(row[col]);
      if (!answer) continue;
      const score = ANSWER_VALUES[answer] ?? 0;
      totalScore += score;

      const dateStr = headers[col];
      const [d, m, y] = dateStr.split("/");
      const dObj = new Date(`${y}-${m}-${d}`);
      if (!lastDate || dObj > lastDate) lastDate = dObj;
    }
    totalScore = Math.max(0, Math.min(6, Math.round(totalScore)));
    return { score: totalScore, lastDate };
  }

  const result = [];

  for (const row of data) {
    const freq = clean(row[3] || "");
    const isQuotidien = freq.includes("quotidien");
    const isSpaced = freq.includes("repetition espacee") || freq.includes("répétition espacée");
    const matchingDays = JOURS.filter(j => freq.includes(j));
    const type = row[2] || "";
    const label = row[4] || "";

    const history = [];
    for (let col = headers.length - 1; col >= 5; col--) {
      const val = row[col];
      const dateStr = headers[col];
      if (val && dateStr) {
        const [d, m, y] = dateStr.split("/");
        const entryDate = new Date(`${y}-${m}-${d}`);
        const entryOnly = new Date(entryDate.getFullYear(), entryDate.getMonth(), entryDate.getDate());
        if (entryOnly <= refDateOnly) {
          history.push({ value: val, date: dateStr });
        }
      }
    }

    let include = false;
    let skipped = false;
    let nextDate = null;
    let reason = null;
    let spacedInfo = null;

    if (isQuotidien || matchingDays.includes(refDayName)) include = true;

    if (isSpaced) {
      const { score, lastDate } = computeScoreAndLastDate(row);
      const delay = DELAYS[score];
      let next = null;
      if (lastDate) {
        next = new Date(lastDate);
        next.setDate(next.getDate() + delay);
        if (isToday && referenceDate < next) {
          skipped = true;
          include = false;
          nextDate = Utilities.formatDate(next, "GMT+1", "dd/MM/yyyy");
          reason = `✅ Réponse positive enregistrée récemment. Prochaine apparition prévue le ${nextDate}.`;
        }
      }
      spacedInfo = {
        score,
        lastDate: lastDate ? Utilities.formatDate(lastDate, "GMT+1", "dd/MM/yyyy") : null,
        nextDate: next ? Utilities.formatDate(next, "GMT+1", "dd/MM/yyyy") : null
      };
    }

    const base = { id: label, label, type, history, isSpaced, spacedInfo };
    if (skipped) {
      result.push({ ...base, skipped: true, nextDate, reason });
    } else if (include) {
      result.push({ ...base, skipped: false });
    }
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}
