const fs = require("fs");
const path = "js/auth-client.js";
let s = fs.readFileSync(path, "utf8");
const old = `    fetchFeishuChannelOrderTrend: function () {
      return fetchGetWithTimeout('/api/data/feishu-channel-order-trend', 600000);
    },
  };`;
const neu = `    fetchFeishuChannelOrderTrend: function () {
      return fetchGetWithTimeout('/api/data/feishu-channel-order-trend', 600000);
    },
    /** 需登录；直播间转化漏斗（sheet4 B/H/K/X/Y 按主播聚合） */
    fetchFeishuLivestreamFunnel: function () {
      return fetchGetWithTimeout('/api/data/feishu-livestream-funnel', 90000);
    },
  };`;
if (!s.includes("fetchFeishuLivestreamFunnel")) {
  if (!s.includes(old)) { console.error("old block not found"); process.exit(1); }
  s = s.replace(old, neu);
  fs.writeFileSync(path, s, "utf8");
  console.log("auth-client patched");
} else console.log("auth-client already patched");
