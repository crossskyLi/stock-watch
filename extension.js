const vscode = require("vscode");
const axios = require("axios");
const baseUrl = "https://api.money.126.net/data/feed/";
let statusBarItems = {};
let stockCodes = [];
let updateInterval = 10000;
let timer = null;
let showTimer = null;
let stockMap = {};

function activate(context) {
  init();
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(handleConfigChange)
  );
}
exports.activate = activate;

function deactivate() {}
exports.deactivate = deactivate;

function init() {
  initShowTimeChecker();
  if (isShowTime()) {
    stockCodes = getStockCodes();

    stockMap = getStockMap(stockCodes);
    updateInterval = getUpdateInterval();
    fetchAllData();
    timer = setInterval(fetchAllData, updateInterval);
  } else {
    hideAllStatusBar();
  }
}
function getStockMap(codes) {
  const map = {};
  for (let i = 0; i < codes.length; i++) {
    map[codes[i]] = {
      priceArr:
        map[codes[i]] && map[codes[i]].priceArr ? map[codes[i]].priceArr : [],
    };
  }
  return map;
}

function initShowTimeChecker() {
  showTimer && clearInterval(showTimer);
  showTimer = setInterval(() => {
    if (isShowTime()) {
      init();
    } else {
      timer && clearInterval(timer);
      hideAllStatusBar();
    }
  }, 1000 * 60 * 10);
}

function hideAllStatusBar() {
  Object.keys(statusBarItems).forEach((item) => {
    statusBarItems[item].hide();
    statusBarItems[item].dispose();
  });
}

function handleConfigChange() {
  timer && clearInterval(timer);
  showTimer && clearInterval(showTimer);
  const codes = getStockCodes();
  Object.keys(statusBarItems).forEach((item) => {
    if (codes.indexOf(item) === -1) {
      statusBarItems[item].hide();
      statusBarItems[item].dispose();
      delete statusBarItems[item];
    }
  });
  init();
}

function getStockCodes() {
  const config = vscode.workspace.getConfiguration();
  const stocks = config.get("stock-watch.stocks");
  return stocks.map((code) => {
    if (isNaN(code[0])) {
      if (code.toLowerCase().indexOf("us_") > -1) {
        return code.toUpperCase();
      } else if (code.indexOf("hk") > -1) {
        return code;
      } else {
        return code.toLowerCase().replace("sz", "1").replace("sh", "0");
      }
    } else {
      return code;
      // return (code[0] === "6" ? "0" : "1") + code;
    }
  });
}

function getUpdateInterval() {
  const config = vscode.workspace.getConfiguration();
  return config.get("stock-watch.updateInterval");
}

function isShowTime() {
  const config = vscode.workspace.getConfiguration();
  const configShowTime = config.get("stock-watch.showTime");
  let showTime = [0, 23];
  if (
    Array.isArray(configShowTime) &&
    configShowTime.length === 2 &&
    configShowTime[0] <= configShowTime[1]
  ) {
    showTime = configShowTime;
  }
  const now = new Date().getHours();
  return now >= showTime[0] && now <= showTime[1];
}

function getItemText(item) {
  return `${item.name} ${keepDecimal(
    item.price || item.nav,
    calcFixedNumber(item)
  )} ${item.percent >= 0 ? " +" : " "}${keepDecimal(item.percent * 100, 2)}% `;
  // 高：${item.high} 低：${item.low} 今：${    item.open  } 昨：${item.yestclose}
}

function getAdvPrice(arr) {
  let total = 0;
  let j = 0;
  for (let i = 0; i < arr.length; i++) {
    if (+arr[i] > 0) {
      total += parseFloat(parseFloat(arr[i]).toFixed(2));
      j++;
    }
  }

  return arr.length ? total / j : total;
}

function getTooltipText(item) {
  const advPrice = getAdvPrice(stockMap[item.code].priceArr);
  const line = stockMap[item.code].priceArr.join("");

  return `【code】${item.type}${item.symbol}
  百分：${keepDecimal(item.percent * 100, 2)}%
  涨跌：${item.updown}
  最高：${item.high}  最低：${item.low}
  今开：${item.open}  昨收：${item.yestclose}
  ---------------
  S: ${item.ask5}
  S: ${item.ask4}
  S: ${item.ask3}
  S: ${item.ask2}
  S: ${item.ask1}
  ---------------
  B: ${item.bid1}
  B: ${item.bid2}
  B: ${item.bid3}
  B: ${item.bid4}
  B: ${item.bid5}
  ---------------
  均价： ${advPrice}
  ---------------
  走势: ${line}`;
}

function getItemColor(item) {
  const config = vscode.workspace.getConfiguration();
  const riseColor = config.get("stock-watch.riseColor");
  const fallColor = config.get("stock-watch.fallColor");

  return item.percent >= 0 ? riseColor : fallColor;
}

function fetchAllData() {
  console.log("fetchAllData");
  axios
    .get(`${baseUrl}${stockCodes.join(",")}?callback=a`)
    .then(
      (rep) => {
        try {
          const result = JSON.parse(rep.data.slice(2, -2));
          let data = [];
          Object.keys(result).map((item) => {
            if (!result[item].code) {
              result[item].code = item; //兼容港股美股
            }
            generatePriceLine(result, item);
            data.push(result[item]);
          });

          displayData(data);
        } catch (error) {}
      },
      (error) => {
        console.error(error);
      }
    )
    .catch((error) => {
      console.error(error);
    });
}

function generatePriceLine(result, item) {
  const lastPrice = stockMap[item].priceArr[stockMap[item].priceArr.length - 1];

  if (result[item].price > lastPrice) {
    stockMap[item].priceArr.push("/");
  } else if (result[item].price < lastPrice) {
    stockMap[item].priceArr.push("\\");
  }
  if (result[item].price !== lastPrice) {
    stockMap[item].priceArr = stockMap[item].priceArr.slice(0, 20);
    stockMap[item].priceArr.push(result[item].price);
  }
}

function displayData(data) {
  data.map((item) => {
    const key = item.code;
    if (statusBarItems[key]) {
      statusBarItems[key].text = getItemText(item);
      statusBarItems[key].color = getItemColor(item);
      statusBarItems[key].tooltip = getTooltipText(item);
    } else {
      statusBarItems[key] = createStatusBarItem(item);
    }
  });
}

function createStatusBarItem(item) {
  const barItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    0 - stockCodes.indexOf(item.code)
  );
  barItem.text = getItemText(item);
  barItem.color = getItemColor(item);
  barItem.tooltip = getTooltipText(item);
  barItem.show();
  return barItem;
}

function keepDecimal(num, fixed) {
  var result = parseFloat(num);
  if (isNaN(result)) {
    return "--";
  }
  return result.toFixed(fixed);
}

function calcFixedNumber(item) {
  var high =
    String(item.high).indexOf(".") === -1
      ? 0
      : String(item.high).length - String(item.high).indexOf(".") - 1;
  var low =
    String(item.low).indexOf(".") === -1
      ? 0
      : String(item.low).length - String(item.low).indexOf(".") - 1;
  var open =
    String(item.open).indexOf(".") === -1
      ? 0
      : String(item.open).length - String(item.open).indexOf(".") - 1;
  var yest =
    String(item.yestclose).indexOf(".") === -1
      ? 0
      : String(item.yestclose).length - String(item.yestclose).indexOf(".") - 1;
  var updown =
    String(item.updown).indexOf(".") === -1
      ? 0
      : String(item.updown).length - String(item.updown).indexOf(".") - 1;
  var max = Math.max(high, low, open, yest, updown);

  if (max === 0) {
    max = 2;
  }

  return max;
}
