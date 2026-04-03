const WIKI="WNp4wbOI3ib7J7kiX2fcZf6Fn8b";
async function main(){
  const tr=await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({app_id:process.env.FEISHU_APP_ID,app_secret:process.env.FEISHU_APP_SECRET})});
  const tj=await tr.json();
  if(tj.code!==0){console.error("token",tj);process.exit(1);}
  const t=tj.tenant_access_token;
  const w=await fetch("https://open.feishu.cn/open-apis/wiki/v2/spaces/get_node?token="+encodeURIComponent(WIKI),{headers:{Authorization:"Bearer "+t}});
  const wj=await w.json();
  if(wj.code!==0){console.error("wiki",wj);process.exit(2);}
  const node=wj.data.node;
  console.log("title",node.title,"obj",node.obj_type,node.obj_token);
  const st=node.obj_token;
  const sq=await fetch("https://open.feishu.cn/open-apis/sheets/v3/spreadsheets/"+encodeURIComponent(st)+"/sheets/query",{headers:{Authorization:"Bearer "+t}});
  const sj=await sq.json();
  if(sj.code!==0){console.error("sheets",sj);process.exit(3);}
  const sheets=sj.data.sheets||[];
  const by=n=>sheets.find(s=>String(s.title||"").toLowerCase()===n);
  const s2=by("sheet2")||sheets[1];
  const s4=by("sheet4")||sheets[3];
  async function cell(rng){
    const u="https://open.feishu.cn/open-apis/sheets/v2/spreadsheets/"+encodeURIComponent(st)+"/values/"+encodeURIComponent(rng)+"?value_render_option=FormattedValue";
    const x=await fetch(u,{headers:{Authorization:"Bearer "+t}});
    return x.json();
  }
  const a=await cell(s2.sheet_id+"!AI111:AI111");
  const b=await cell(s4.sheet_id+"!D17:D17");
  console.log("Sheet2 AI111",a.code,a.data&&a.data.valueRange&&a.data.valueRange.values&&a.data.valueRange.values[0]&&a.data.valueRange.values[0][0]);
  console.log("Sheet4 D17",b.code,b.data&&b.data.valueRange&&b.data.valueRange.values&&b.data.valueRange.values[0]&&b.data.valueRange.values[0][0]);
}
main();
