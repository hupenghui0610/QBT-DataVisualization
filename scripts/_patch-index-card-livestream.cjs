const fs = require("fs");
const path = "index.html";
let s = fs.readFileSync(path, "utf8");
if (s.includes('id="chartLivestreamFunnel"')) { console.log("index html already has card"); process.exit(0); }
const old = `    </div>
    </div>
  </div>
  </div>
  </div>
  <div id="main-tab-panel-industry" class="main-tab-panel" role="tabpanel" aria-labelledby="main-tab-btn-industry">`;
const neu = `    </div>
    </div>
    <div class="card wide">
      <h3><i class="chart-title-icon fa fa-filter"></i><span>直播间转化漏斗</span></h3>
      <span id="livestreamFunnelStatus" class="daily-feishu-status"></span>
      <div class="date-range">主播：<select id="livestreamFunnelAnchor"><option value="">请选择主播</option></select></div>
      <div id="chartLivestreamFunnel" class="chart"></div>
    </div>
  </div>
  </div>
  </div>
  <div id="main-tab-panel-industry" class="main-tab-panel" role="tabpanel" aria-labelledby="main-tab-btn-industry">`;
if (!s.includes(old)) { console.error("marker not found"); process.exit(1); }
s = s.replace(old, neu);
fs.writeFileSync(path, s, "utf8");
console.log("index html card ok");
