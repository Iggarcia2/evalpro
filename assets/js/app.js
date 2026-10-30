'use strict';
(() => {
  const STORAGE_KEY='evalpro_proyecto_v1';
  const steps=[{id:'capex',name:'Inversión (CAPEX)',short:'Maquinaria, obras e instalaciones',icon:'01'},
    {id:'staff',name:'Personal y sueldos',short:'Nómina y cargas sociales',icon:'02'},
    {id:'fixed',name:'Gastos fijos',short:'Costos independientes de producción',icon:'03'},
    {id:'variable',name:'Gastos variables',short:'Costos ligados a ventas o volumen',icon:'04'},
    {id:'revenue',name:'Ingresos y producción',short:'Volúmenes, precios y crecimiento',icon:'05'},
    {id:'finance',name:'Impuestos y ajustes',short:'Depreciación y capital de trabajo',icon:'06'}];
  // El HTML distribuido es genérico: los importes de Terraciclo se importan desde un JSON local privado.
  const initial=()=>({version:1,
    meta:{name:'Proyecto nuevo',description:'Evaluación económica de proyecto de ingeniería',projectType:'commercial',currency:'ARS',frequency:'monthly',periods:60,discountAnnual:30,inflationAnnual:0,startDate:'2026-11-01',constructionMonths:0,rampMonths:1,rampStartPct:100},
    capex:[],staff:[],fixed:[],variable:[],products:[],selfUse:[],
    finance:{tax:30,social:50,bonus:1,sacEnabled:true,lossCarry:true,workingCapitalMode:'automatic',daysReceivable:30,daysInventory:15,daysPayable:30,workingCapitalPct:0,manualWorkingCapitalAmount:0,residualPct:0},
    scenario:{selected:'base',priceOptimistic:10,costOptimistic:-5,capexOptimistic:-5,pricePessimistic:-10,costPessimistic:10,capexPessimistic:10}
  });
  function hydrate(obj){const base=initial();if(!obj||typeof obj!=='object'||obj.version!==1)throw Error('Archivo incompatible con esta versión');for(const key of ['meta','capex','staff','fixed','variable','products','finance','scenario'])if(!(key in obj))throw Error('Falta sección: '+key);for(const key of ['capex','staff','fixed','variable','products'])if(!Array.isArray(obj[key])||obj[key].length>250)throw Error('Lista inválida: '+key);if(obj.selfUse!==undefined&&(!Array.isArray(obj.selfUse)||obj.selfUse.length>250))throw Error('Lista inválida: selfUse');const parsed={...base,...obj,selfUse:obj.selfUse||[],meta:{...base.meta,...obj.meta},finance:{...base.finance,...obj.finance},scenario:{...base.scenario,...obj.scenario}};if(!['commercial','self','mixed'].includes(parsed.meta.projectType))parsed.meta.projectType='commercial';if(obj.finance.sacEnabled===undefined)parsed.finance.sacEnabled=Number(obj.finance.bonus)>0;parsed.capex=parsed.capex.map(a=>({...{economicLife:Number(a.life)||10,replace:'no',replacementGrowthAnnual:0,resalePct:0},...a}));parsed.staff=parsed.staff.map(a=>({...{endMode:'indefinido',end:12,salaryGrowthAnnual:0},...a}));parsed.fixed=parsed.fixed.map(a=>({...{supplierCredit:'no'},...a}));parsed.variable=parsed.variable.map(a=>({...{inventoryEligible:'no',supplierCredit:'no'},...a}));if(!Object.prototype.hasOwnProperty.call(obj.finance,'workingCapitalMode'))parsed.finance.workingCapitalMode=Number(obj.finance.workingCapitalPct||0)>0?'percent':'automatic';return parsed}
  const isCommercial=()=>model.meta.projectType==='commercial';
  const hasSales=()=>model.meta.projectType!=='self';
  const hasSelfUse=()=>model.meta.projectType!=='commercial';
  const modeLabel=()=>({commercial:'Proyecto comercial',self:'Proyecto de autoconsumo',mixed:'Proyecto mixto'})[model.meta.projectType]||'Proyecto comercial';
  const stepLabel=id=>id==='revenue'?(isCommercial()?'Ingresos y producción':hasSales()?'Ventas y autoconsumo':'Producción y ahorros'):(steps.find(s=>s.id===id)?.name||'');
  let model;try{model=hydrate(JSON.parse(localStorage.getItem(STORAGE_KEY)))}catch{model=initial()}
  let view='general', chart=null, toastTimer=null;
  const $=sel=>document.querySelector(sel);
  const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
  const n=v=>{const x=Number(v);return Number.isFinite(x)?x:0};
  const bound=(v,min,max)=>Math.max(min,Math.min(max,n(v)));
  const fmt=(value,d=0)=>Number.isFinite(value)?new Intl.NumberFormat('es-AR',{minimumFractionDigits:d,maximumFractionDigits:d}).format(value):'—';
  const money=value=>`${model.meta.currency} ${fmt(value,0)}`;
  const pct=value=>Number.isFinite(value)?fmt(value,2)+' %':'—';
  const periodWord=()=>model.meta.frequency==='monthly'?'mes':'año';
  const periodPlural=()=>model.meta.frequency==='monthly'?'meses':'años';
  const py=()=>model.meta.frequency==='monthly'?12:1;
  const annualPeriod=rate=>Math.pow(1+rate/100,1/py())-1;
  function save(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(model));$('#autosave').textContent='● Guardado local'}catch(e){$('#autosave').textContent='⚠ No se pudo guardar';}}
  function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.remove('opacity-0','pointer-events-none','translate-y-2');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.add('opacity-0','pointer-events-none','translate-y-2'),3300)}
  function download(filename,content,mime){const blob=new Blob([content],{type:mime});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
  function configScenario(){const x=model.scenario||{};switch(x.selected){case 'optimista':return {price:1+n(x.priceOptimistic)/100,cost:1+n(x.costOptimistic)/100,capex:1+n(x.capexOptimistic)/100};case 'pesimista':return {price:1+n(x.pricePessimistic)/100,cost:1+n(x.costPessimistic)/100,capex:1+n(x.capexPessimistic)/100};default:return {price:1,cost:1,capex:1}}}
  // Motor mensual interno. En vista anual se agrupa el flujo sin perder la fecha de SAC ni el valor temporal del dinero.
  // Período cero: desembolsos iniciales; período mensual 1 = mes calendario de la fecha inicial.
  function compute(mod={}){
    const p=model, annual=p.meta.frequency==='annual';
    const count=bound(Math.round(n(p.meta.periods)),1,annual?60:360);
    const months=annual?count*12:count, rate=Math.pow(1+n(p.meta.discountAnnual)/100,1/12)-1;
    const inflationRate=Math.pow(1+n(p.meta.inflationAnnual)/100,1/12)-1;
    const adj={...configScenario(),...mod}, scale=(base,month)=>base*Math.pow(1+inflationRate,month), scenarioCost=Math.max(0,adj.cost), scenarioCapex=Math.max(0,adj.capex);
    const startParts=(String(p.meta.startDate||'2026-01-01')).split('-').map(Number);
    const startY=Number.isFinite(startParts[0])?startParts[0]:2026,startM=(startParts[1]||1)-1;
    const calendarAt=m=>new Date(Date.UTC(startY,startM+m-1,1));
    const monthStart=(entry,group)=>{
      const v=Math.max(0,Math.round(n(entry.start??1)));
      return annual&&group!=='staff'?Math.max(1,(Math.max(1,v)-1)*12+1):Math.max(1,v);
    };
    const capexAt=entry=>Math.max(0,Math.round(n(entry.at)))*(annual?12:1);
    const growth=(r,month)=>Math.pow(Math.max(.000001,1+n(r)/100),Math.max(0,month-1)/12);
    const zeros=()=>new Array(months+1).fill(0);
    const caps=zeros(),replacements=zeros(),deprs=zeros(),sales=zeros();
    const appendCapex=(amount,buyMonth,lifeMonths,isReplacement=false,retireMonth=months+1)=>{
      if(buyMonth>months)return;
      caps[buyMonth]+=amount;
      if(isReplacement)replacements[buyMonth]+=amount;
      if(lifeMonths>0){
        const perMonth=amount/lifeMonths;
        // La depreciación se detiene al vender o sustituir el activo; la pérdida/ganancia por baja se modela por separado.
        for(let d=buyMonth+1;d<=months&&d<=buyMonth+lifeMonths&&d<retireMonth;d++)deprs[d]+=perMonth;
      }
    };
    for(const asset of p.capex){
      const amount=Math.max(0,n(asset.amount))*scenarioCapex;
      const first=capexAt(asset);
      const depreciable=Math.max(0,Math.round(n(asset.life)*12));
      if(first>months)continue;
      const replaceEnabled=asset.replace==='yes';
      const economicMonths=Math.round(n(asset.economicLife)*12);
      const validReplacement=replaceEnabled&&economicMonths>0;
      const firstValue=scale(amount,first);
      appendCapex(firstValue,first,depreciable,false,validReplacement?first+economicMonths:months+1);
      if(validReplacement){
        const premium=Math.max(-99,n(asset.replacementGrowthAnnual||0))/100;
        for(let at=first+economicMonths;at<months;at+=economicMonths){
          const purchase=scale(amount,at)*Math.pow(1+premium,(at-first)/12);
          appendCapex(purchase,at,depreciable,true,at+economicMonths);
          // Recupero opcional del equipo sustituido, antes de impuestos de enajenación.
          sales[at]+=purchase*Math.max(0,n(asset.resalePct||0))/100;
        }
      }
    }
    // Nómina por mes, SAC por calendario argentino y liquidación proporcional al final del contrato.
    const salaries=zeros(),bonus=zeros();
    for(const st of p.staff){
      const first=monthStart(st,'staff');
      const openEnded=st.endMode!=='temporal';
      const last=Math.min(months,openEnded?months:Math.max(0,Math.round(n(st.end||first))));
      if(first>last)continue;
      const row=zeros();
      for(let m=first;m<=last;m++){
        row[m]=Math.max(0,n(st.qty))*Math.max(0,n(st.salary))*scale(1,m)*growth(st.salaryGrowthAnnual||0,m);
        salaries[m]+=row[m];
      }
      if(!p.finance.sacEnabled)continue;
      let anchor=first;
      while(anchor<=last){
        const date=calendarAt(anchor),semester=date.getUTCMonth()<6?0:1;
        const year=date.getUTCFullYear();
        let end=anchor;
        while(end+1<=last){const next=calendarAt(end+1);if(next.getUTCFullYear()!==year||(next.getUTCMonth()<6?0:1)!==semester)break;end++;}
        const base=Math.max(...row.slice(anchor,end+1));
        const worked=end-anchor+1;
        // Semestre 6 meses completos; comienzo o baja intermedia = SAC proporcional.
        bonus[end]+=base*.5*(worked/6);
        anchor=end+1;
      }
    }
    // Proyección mensual. Las partidas de capital de trabajo se calculan sobre saldos,
    // no como un porcentaje genérico de las ventas ni como un segundo OPEX.
    const rows=[],flows=[],monthly=[];let loss=0,lastWC=0;
    const construction=bound(Math.round(n(p.meta.constructionMonths)),0,months);
    const rampMonths=bound(Math.round(n(p.meta.rampMonths||1)),1,120);
    const rampStart=bound(n(p.meta.rampStartPct??100),0,100)/100;
    const forecast=[];
    for(let m=0;m<=months;m++){
      const factor=scale(1,m),isOperating=m>construction;
      const rampStep=Math.max(0,m-construction-1);
      const ramp=isOperating?(rampMonths===1?1:Math.min(1,rampStart+(1-rampStart)*rampStep/(rampMonths-1))):0;
      let units=0,revenue=0,savings=0,fixed=0,variable=0,inventoriableCost=0,inventoryCreditCost=0,creditOperating=0;
      if(m>0){
        if(hasSales())for(const pr of p.products){
          if(m<monthStart(pr,'products')||!isOperating)continue;
          const q=Math.max(0,n(pr.quantity))/(annual?12:1)*growth(pr.volumeGrowth,m)*ramp;
          units+=q;
          revenue+=q*Math.max(0,n(pr.price))*Math.max(0,adj.price)*factor*growth(pr.priceGrowth,m);
        }
        if(hasSelfUse())for(const item of p.selfUse){
          if(m<monthStart(item,'selfUse')||!isOperating)continue;
          const q=Math.max(0,n(item.quantity))/(annual?12:1)*growth(item.volumeGrowth,m)*ramp;
          units+=q;
          // Beneficio incremental por evitar una compra externa: no es facturación ni genera cuentas por cobrar.
          savings+=q*Math.max(0,n(item.referencePrice))*Math.max(0,adj.price)*factor*growth(item.referencePriceGrowth,m);
        }
        for(const c of p.fixed){
          if(m<monthStart(c,'fixed'))continue;
          const cost=Math.max(0,n(c.amount))/(annual?12:1)*factor*scenarioCost;
          fixed+=cost;
          if(c.supplierCredit==='yes')creditOperating+=cost;
        }
        for(const c of p.variable){
          if(m<monthStart(c,'variable'))continue;
          const isPerUnit=c.driver!=='revenue'&&c.driver!=='benefits';
          const variableBase=c.driver==='benefits'?revenue+savings:revenue;
          const cost=isPerUnit?units*Math.max(0,n(c.amount))*factor*scenarioCost:variableBase*Math.max(0,n(c.amount))/100*scenarioCost;
          variable+=cost;
          if(isPerUnit&&c.inventoryEligible==='yes'){
            inventoriableCost+=cost;
            if(c.supplierCredit==='yes')inventoryCreditCost+=cost;
          }
          if(c.supplierCredit==='yes')creditOperating+=cost;
        }
      }
      forecast.push({units,revenue,savings,benefits:revenue+savings,fixed,variable,inventoriableCost,inventoryCreditCost,creditOperating});
    }
    const f=p.finance||{},useAuto=f.workingCapitalMode==='automatic';
    const dso=bound(f.daysReceivable,0,365),dio=bound(f.daysInventory,0,365),dpo=bound(f.daysPayable,0,365);
    const rSales=forecast.map(x=>x.revenue);
    // Ventas / compras se distribuyen uniformemente dentro de cada mes de 30 días.
    // Soporta DSO y DPO de más de 30 días con saldos que abarcan varios meses.
    const outstanding=(arr,m,days)=>{
      if(days<=0)return 0;
      let balance=0;
      for(let lag=0;lag<=Math.min(m,Math.ceil(days/30));lag++){
        const share=bound(days/30-lag,0,1);
        if(share>0)balance+=arr[m-lag]*share;
      }
      return balance;
    };
    // El inventario se estima a costo de insumos almacenables, utilizando demanda futura.
    // Si la construcción finaliza en el mes 6, los insumos del mes 7 se financian al cierre del 6;
    // para comienzo en mes 1, pueden requerirse desde el período 0.
    const stockForward=(m,days,key)=>{
      if(days<=0)return 0;
      let stock=0;
      for(let k=0;k<Math.ceil(days/30)&&m+k+1<=months;k++){
        stock+=forecast[m+k+1][key]*bound(days/30-k,0,1);
      }
      return stock;
    };
    const inventories=forecast.map((_,m)=>useAuto?stockForward(m,dio,'inventoriableCost'):0);
    const inventoriesOnCredit=forecast.map((_,m)=>useAuto?stockForward(m,dio,'inventoryCreditCost'):0);
    const supplierPurchases=forecast.map((x,m)=>{
      if(!useAuto)return 0;
      const changeInventoryCredit=inventoriesOnCredit[m]-(m>0?inventoriesOnCredit[m-1]:0);
      return Math.max(0,x.creditOperating+changeInventoryCredit);
    });
    for(let m=0;m<=months;m++){
      const op=forecast[m],{units,revenue,savings,benefits,fixed,variable}=op;
      const salary=salaries[m],sac=bonus[m],social=(salary+sac)*Math.max(0,n(f.social))/100;
      const staff=(salary+sac+social)*scenarioCost;
      const depreciation=deprs[m],ebitda=benefits-staff-fixed-variable;
      const taxable=ebitda-depreciation;
      let taxBase=Math.max(0,taxable);
      if(f.lossCarry){if(taxable<0)loss+=-taxable;else{const used=Math.min(loss,taxBase);loss-=used;taxBase-=used;}}
      const taxes=taxBase*Math.max(0,n(f.tax))/100;
      const receivables=useAuto?outstanding(rSales,m,dso):0;
      const inventory=inventories[m];
      const payables=useAuto?outstanding(supplierPurchases,m,dpo):0;
      const wcBalance=useAuto?receivables+inventory-payables:f.workingCapitalMode==='manual_amount'?Math.max(0,n(f.manualWorkingCapitalAmount)):(m===0?0:benefits*Math.max(0,n(f.workingCapitalPct))/100);
      const deltaWC=wcBalance-lastWC;lastWC=wcBalance;
      // Se supone liquidación total de créditos, existencias y deudas al cierre del horizonte.
      // Un capital de trabajo negativo produce un pago neto al cierre (no un recupero positivo).
      const releaseWC=m===months?wcBalance:0;
      const residual=m===months?p.capex.reduce((sum,a)=>sum+Math.max(0,n(a.amount))*scenarioCapex,0)*Math.max(0,n(f.residualPct))/100:0;
      const resale=sales[m],capex=caps[m],replacementCapex=replacements[m];
      const freeCash=ebitda-taxes-capex-deltaWC+releaseWC+residual+resale;
      const discount=freeCash/Math.pow(1+rate,m);
      flows.push(freeCash);
      monthly.push({t:m,units,revenue,savings,benefits,salary,social:social*scenarioCost,bonus:sac*scenarioCost,staff,fixed,variable,ebitda,depreciation,taxable,taxes,capex,replacementCapex,resale,receivables,inventory,payables,wcBalance,deltaWC,releaseWC,residual,freeCash,discount});
    }
    const sumColumns=['units','revenue','savings','benefits','salary','social','bonus','staff','fixed','variable','ebitda','depreciation','taxable','taxes','capex','replacementCapex','resale','deltaWC','releaseWC','residual','freeCash','discount'];
    let cumulative=0,discountCum=0;
    for(let t=0;t<=count;t++){
      const row={t};for(const k of sumColumns)row[k]=0;
      const lo=t===0?0:(annual?(t-1)*12+1:t),hi=t===0?0:(annual?t*12:t);
      for(let m=lo;m<=hi;m++)for(const k of sumColumns)row[k]+=monthly[m][k];
      for(const k of ['receivables','inventory','payables','wcBalance'])row[k]=monthly[hi][k];
      cumulative+=row.freeCash;discountCum+=row.discount;
      row.cumulative=cumulative;row.discountCum=discountCum;
      rows.push(row);
    }
    const npv=monthly.reduce((a,b)=>a+b.discount,0);
    const roots=findIrrs(flows),irrAnnual=roots.map(x=>Math.expm1(x*12)*100);
    const payback=(k)=>{
      if(rows[0][k]>=0)return 0;
      for(let i=1;i<rows.length;i++)if(rows[i-1][k]<0&&rows[i][k]>=0)return(i-1)+(-rows[i-1][k])/(rows[i][k]-rows[i-1][k]);
      return null;
    };
    const investment=rows.reduce((a,b)=>a+b.capex,0),cash=rows.reduce((a,b)=>a+b.freeCash,0);
    return {lines:rows,monthly,flows,npv,irrAnnual,roots,payback:payback('cumulative'),discountPayback:payback('discountCum'),roi:investment>0?cash/investment*100:null,invest:investment,periodRate:annual?Math.pow(1+rate,12)-1:rate,periodInflation:annual?Math.pow(1+inflationRate,12)-1:inflationRate,revenue:rows.reduce((a,b)=>a+b.revenue,0),savings:rows.reduce((a,b)=>a+b.savings,0),benefits:rows.reduce((a,b)=>a+b.benefits,0),costs:rows.reduce((a,b)=>a+b.staff+b.fixed+b.variable,0),sac:rows.reduce((a,b)=>a+b.bonus,0),replacementInvest:rows.reduce((a,b)=>a+b.replacementCapex,0),wcPeak:Math.max(0,...monthly.map(x=>x.wcBalance)),wcPreOpening:Math.max(0,...monthly.slice(0,construction+1).map(x=>x.wcBalance)),wcClosing:monthly[months].wcBalance,wcMode:f.workingCapitalMode};
  }
  // La función busca raíces de NPV=0 usando x=ln(1+r); estabiliza la suma para tasas extremas.
  // Detecta cambios de signo y también raíces tangenciales en extremos locales.
  function findIrrs(flows){
    if(flows.length<2||flows.every(c=>Math.abs(c)<1e-10)||!flows.some(c=>c>0)||!flows.some(c=>c<0))return [];
    const max=Math.max(...flows.map(v=>Math.abs(v)),1),count=flows.length-1;
    const evalAt=(x,derivative=false)=>{const shift=Math.max(0,-x*count);let s=0;for(let i=0;i<flows.length;i++){const y=flows[i]/max*Math.exp(-x*i-shift);s+=derivative?-i*y:y}return s};
    const bisection=(a,b,derivative=false)=>{let fa=evalAt(a,derivative);for(let k=0;k<90;k++){const mid=(a+b)/2,fm=evalAt(mid,derivative);if(Math.abs(b-a)<1e-11)return mid;if((fa<=0&&fm>=0)||(fa>=0&&fm<=0)){b=mid}else{a=mid;fa=fm}}return(a+b)/2};
    const minX=-12,maxX=12,N=2800,roots=[],extrema=[];
    let lastX=minX,lastVal=evalAt(lastX),lastDerivative=evalAt(lastX,true);
    for(let i=1;i<=N;i++){
      const x=minX+(maxX-minX)*i/N,v=evalAt(x),dv=evalAt(x,true);
      if(v===0)roots.push(x);
      if(lastVal*v<0)roots.push(bisection(lastX,x));
      else if(Math.abs(v)<1e-13&&Math.abs(lastVal)<1e-13&&i>1){ /* Región prácticamente nula: no asumir raíz */ }
      if(dv===0)extrema.push(x);
      if(lastDerivative*dv<0)extrema.push(bisection(lastX,x,true));
      lastX=x;lastVal=v;lastDerivative=dv;
    }
    for(const x of extrema){
      const v=evalAt(x),scaleLocal=flows.reduce((a,c,i)=>a+Math.abs(c)/max*Math.exp(-x*i-Math.max(0,-x*count)),0);
      if(Math.abs(v)<Math.max(1e-14,scaleLocal*1e-9))roots.push(x);
    }
    return roots.filter(x=>Number.isFinite(x)).sort((a,b)=>a-b).filter((x,i,arr)=>i===0||Math.abs(x-arr[i-1])>1e-6);
  }
  function warnings(){const a=[];
    if(hasSales()&&!model.products.length)a.push('Todavía no cargaste productos o servicios para generar ventas externas.');
    if(hasSelfUse()&&!model.selfUse.length)a.push('Todavía no cargaste productos destinados al autoconsumo ni su precio de compra externa evitada.');
    if(hasSelfUse())a.push('Autoconsumo: el beneficio se calcula frente a continuar comprando el producto. Incluí todos los costos incrementales de fabricación, incluso la materia prima propia a valor de oportunidad; evitá cargar el mismo ahorro dos veces.');
    if(!model.capex.length)a.push('Todavía no cargaste inversiones de capital (CAPEX).');
    if(model.meta.description.toLowerCase().includes('terraciclo.xlsx'))a.push('Los datos de Terraciclo fueron importados del Excel. Verificá especialmente las unidades, el importe de maquinaria, los salarios y la tasa de descuento.');
    if(model.variable.some(v=>n(v.amount)===0))a.push('Hay gastos variables con costo cero pendiente de definición.');
    if(!hasSales()&&model.variable.some(v=>v.driver==='revenue'&&n(v.amount)>0))a.push('Hay costos variables definidos como porcentaje de ventas externas, pero elegiste autoconsumo: esos conceptos resultan en cero. Cambiá su base a unidades o beneficios económicos.');
    if(model.meta.frequency==='annual')a.push('La vista anual agrupa los importes calculados mes a mes. El SAC y el inicio/fin del personal siguen meses calendario; los demás costos y volúmenes base son anuales.');
    if(model.staff.some(st=>st.endMode==='temporal'&&Math.round(n(st.end))<Math.max(1,Math.round(n(st.start)))))a.push('Hay puestos con mes de fin anterior al de ingreso; corregí sus fechas.');
    if(n(model.meta.constructionMonths)>n(model.meta.periods)*(model.meta.frequency==='annual'?12:1))a.push('La construcción ocupa todo el horizonte; no habrá meses operativos con ingresos.');
    if(model.capex.some(a=>a.replace==='yes'&&!(n(a.economicLife)>0)))a.push('Una reposición requiere vida útil económica mayor que cero.');
    if(model.capex.some(a=>n(a.resalePct)>0))a.push('Los recuperos por venta de activos no incluyen efectos impositivos sobre la enajenación.');
    if(model.capex.some(a=>a.replace==='yes'&&n(a.economicLife)<n(a.life)))a.push('Al reemplazar antes del fin de la vida contable, no se modela el impuesto por ganancia/pérdida en la baja del activo.');
    if(model.finance.workingCapitalMode==='percent')a.push('Usás capital de trabajo simplificado como porcentaje de beneficios económicos. El cálculo automático por días ofrece más detalle.');
    if(model.finance.workingCapitalMode==='automatic'&&n(model.finance.daysInventory)>0&&!model.variable.some(v=>v.inventoryEligible==='yes'))a.push('Configuraste días de inventario, pero ningún costo variable está marcado como insumo almacenable. El inventario se calculará en cero.');
    if(model.finance.workingCapitalMode==='automatic'&&n(model.finance.daysPayable)>0&&![...model.variable,...model.fixed].some(v=>v.supplierCredit==='yes'))a.push('Configuraste días de pago a proveedores, pero ningún rubro de gastos está marcado como compra a crédito. Las cuentas por pagar serán cero.');
    if(n(model.finance.residualPct)>0)a.push('El valor residual se agrega al flujo final sin modelar el impuesto específico sobre la venta de activos.');
    return a}
  // Glosario para la ayuda contextual: cada campo tiene una explicación breve.
  const glossary={
    meta:{
      name:'Nombre con el que vas a identificar y guardar esta evaluación.',
      projectType:'Comercial: vendés a terceros. Autoconsumo: evitás comprar un insumo o producto. Mixto: una parte se vende y otra se consume internamente. Los campos del paso 5 cambian según esta opción.',
      startDate:'Mes calendario en que empieza el proyecto: determina cuándo se liquidan los SAC de junio y diciembre. Se trabaja con meses completos.',
      description:'Resumen del alcance y los principales supuestos del proyecto.',
      currency:'Moneda que se usa para todos los importes. Cambiarla no convierte automáticamente los valores.',
      frequency:'Elegí si cada columna del flujo representa un mes o un año. También define las unidades de desembolso.',
      periods:'Horizonte total del proyecto, que incluye construcción y operación: expresado en meses o años según la configuración.',
      discountAnnual:'Rentabilidad mínima exigida o costo de capital (WACC), expresada como tasa efectiva anual. El sistema la convierte según el período elegido.',
      inflationAnnual:'Inflación efectiva anual estimada. Actualiza sueldos, precios, costos y las nuevas compras de activos.' ,
      constructionMonths:'Meses necesarios para construir y poner en marcha la planta. No se generan ventas antes de terminar este plazo.',
      rampMonths:'Cantidad de meses para alcanzar el 100 % de la capacidad después de la construcción.',
      rampStartPct:'Porcentaje de la capacidad prevista que se utiliza en el primer mes operativo. Aumenta linealmente hasta 100 %.'
    },
    capex:{
      name:'Nombre del activo o inversión, por ejemplo: reactor, instalación eléctrica u obra civil.',
      category:'Clasificación de la inversión para identificar equipos, obras, instalaciones u otros activos.',
      amount:'Costo de adquisición o construcción del activo. Es una salida de caja en el período elegido.',
      life:'Años de depreciación contable lineal. No obliga a reemplazar el activo. La depreciación modifica impuestos, no la caja.',
      economicLife:'Años de uso real hasta que corresponde reemplazar el equipo o vehículo, independientes de la depreciación contable.',
      replace:'Elegí si querés programar compras de reposición al vencer la vida útil económica. No se repone después de terminado el proyecto.',
      replacementGrowthAnnual:'Variación REAL anual adicional del precio de reposición, por encima de la inflación general.',
      resalePct:'Valor que recuperás al vender el activo usado como porcentaje del precio corriente del equipo nuevo. No incluye impuestos sobre venta.',
      at:'Momento en que se paga la inversión. El período 0 es el desembolso inicial; 1 es el primer mes o primer año, según Datos generales.'
    },
    staff:{
      name:'Cargo, categoría o puesto de trabajo, por ejemplo: operario, supervisor o administración.',
      qty:'Cantidad de personas de este puesto que se incluyen en el costo laboral.',
      salary:'Sueldo mensual por persona, antes de sumar cargas sociales y sueldo anual complementario.',
      start:'Mes de contratación contado desde el inicio del proyecto. El mes 1 es el primer mes del proyecto, incluso si el flujo se muestra por años.',
      endMode:'Indefinido: el puesto continúa hasta el final del modelo. Temporal: indicá el último mes trabajado.',
      end:'Último mes en que trabajará este puesto (inclusive). Si finaliza a mitad de semestre, se liquidará el SAC proporcional en ese mes.',
      salaryGrowthAnnual:'Ajuste salarial REAL anual adicional, por encima de la inflación general. El SAC se calcula con el mejor sueldo mensual de cada semestre.'
    },
    fixed:{
      name:'Gasto que no cambia directamente con el volumen, por ejemplo alquiler, seguro o vigilancia.',
      amount:'Monto de este gasto en cada mes o año, según la periodicidad general. Se ajusta por inflación.',
      start:'Período a partir del cual comienza a pagarse el gasto fijo.',
      supplierCredit:'Marcá Sí únicamente si este costo se factura por un proveedor y se paga a crédito. No incluye personal ni impuestos.'
    },
    variable:{
      name:'Costo relacionado con el volumen producido o con la facturación.',
      driver:'Costo por unidad producida (ventas y autoconsumo), porcentaje de ventas externas o porcentaje de beneficios económicos (ventas + ahorros). Esto define cómo se calcula el costo.',
      amount:'Para costo por unidad, ingresá un importe por unidad total producida. Para porcentaje, ingresá por ejemplo 5 para un 5 % de la base elegida.',
      start:'Período a partir del cual se aplica este costo variable.',
      inventoryEligible:'Marcá Sí SOLO para insumos o materiales que se compran y almacenan antes de consumirlos. No incluir electricidad, fletes, comisiones o mano de obra.',
      supplierCredit:'Marcá Sí si este gasto se paga a proveedores con los días de crédito indicados. Los costos sin crédito se consideran pagados al momento de uso/consumo.'
    },
    products:{
      name:'Nombre del producto o servicio que se vende a clientes externos.',
      quantity:'Unidades vendidas por mes o por año en el escenario base, según la periodicidad seleccionada.',
      price:'Precio de venta por unidad al inicio. Se ajusta por inflación y por la variación real indicada.',
      start:'Primer período con ventas de este producto. Antes de ese período, sus ingresos son cero.',
      volumeGrowth:'Cambio anual de la cantidad vendida, sin contar inflación. Puede ser positivo o negativo.',
      priceGrowth:'Cambio anual del precio por encima o por debajo de la inflación general.'
    },
    selfUse:{
      name:'Producto fabricado para consumo interno, por ejemplo expeller destinado al alimento de la granja.',
      quantity:'Cantidad consumida internamente por mes o año (según Datos generales). No incluye unidades vendidas a terceros.',
      referencePrice:'Precio por unidad que tendrías que pagar para comprar afuera un producto equivalente puesto en destino. Es un costo evitado, no una venta.',
      start:'Primer período en el que comienza a utilizarse internamente el producto.',
      volumeGrowth:'Variación anual del volumen de consumo propio, sin inflación.',
      referencePriceGrowth:'Variación anual del precio externo de referencia, adicional a la inflación.'
    },
    finance:{
      social:'Porcentaje adicional sobre sueldos y SAC que representa aportes patronales y otros costos sociales.',
      bonus:'Campo histórico de versiones anteriores. Ahora el SAC argentino se calcula por semestre y se paga en junio/diciembre o al finalizar el contrato.',
      sacEnabled:'Activá el aguinaldo argentino: 50% del mejor sueldo mensual por semestre, proporcional a meses trabajados (enero–junio / julio–diciembre).',
      tax:'Porcentaje de impuesto aplicado a la utilidad imponible positiva, después de descontar depreciación y eventuales pérdidas acumuladas.',
      workingCapitalMode:'Automático: cuentas por cobrar, inventarios y proveedores. Manual: monto total de dinero inmovilizado al principio o estimación como % de ventas.',
      daysReceivable:'Días promedio desde que vendés hasta que cobrás (DSO). 0 = cobro contado; 60 = se financian aproximadamente dos meses de ventas.',
      daysInventory:'Días de insumos almacenables antes de su consumo (DIO). Se calculan al costo de los rubros marcados «Almacenable» en Gastos variables, NO sobre el precio de venta.',
      daysPayable:'Días promedio que tardás en pagar las compras a proveedores (DPO). Solo se aplica a los gastos que marcaste «Crédito de proveedores». No se aplica a sueldos ni impuestos.',
      workingCapitalPct:'Alternativa manual antigua: porcentaje de ventas mensuales inmovilizado como capital de trabajo, ajustado mes a mes.',
      manualWorkingCapitalAmount:'Importe del capital de trabajo a financiar en el período 0, independiente de CAPEX y OPEX. Se supone que se recupera al finalizar el proyecto.',
      residualPct:'Valor de recupero al terminar el proyecto, calculado como porcentaje del CAPEX base.',
      lossCarry:'Si está habilitado, las pérdidas impositivas se trasladan para compensar ganancias gravadas de períodos posteriores.',
      salaryFrequency:'Los sueldos se ingresan siempre como valores mensuales. Si el flujo es anual, la aplicación los multiplica por 12.'
    },
    scenario:{
      selected:'Elegí si se calculan resultados con supuestos base, optimistas o conservadores.',
      priceOptimistic:'Porcentaje de cambio en los precios de venta del escenario optimista, respecto al caso base.',
      costOptimistic:'Porcentaje de variación de costos operativos del escenario optimista respecto al caso base.',
      capexOptimistic:'Porcentaje de variación de las inversiones del escenario optimista respecto al caso base.',
      pricePessimistic:'Porcentaje de cambio de precios de venta del escenario conservador respecto al caso base.',
      costPessimistic:'Porcentaje de variación de costos operativos del escenario conservador respecto al caso base.',
      capexPessimistic:'Porcentaje de variación del CAPEX del escenario conservador respecto al caso base.'
    },
    result:{
      'Escenario:':'Conjunto de supuestos utilizado para recalcular ingresos, costos e inversiones.',
      'Valor actual neto (VAN)':'Suma de todos los flujos de fondos descontados al costo del capital. Si es positivo, el proyecto supera la rentabilidad exigida bajo estos supuestos.',
      'Tasa interna de retorno (TIR)':'Tasa que hace cero el VAN. Se muestra como tasa efectiva anual. Si hay varias soluciones, se indica en lugar de elegir una arbitrariamente.',
      'Repago simple':'Tiempo estimado hasta que el flujo de caja acumulado pasa de negativo a cero o positivo, sin descuento por tasa.',
      'Repago descontado':'Tiempo estimado hasta recuperar la inversión considerando el valor del dinero en el tiempo.',
      'Ventas acumuladas':'Facturación externa nominal del proyecto. No incluye consumo propio.',
      'Ahorros por autoconsumo':'Compras externas evitadas al consumir internamente la producción, calculadas a precio externo equivalente. No son ventas facturadas.',
      'Beneficios económicos':'Suma de ventas externas y ahorros por compras evitadas.',
      'OPEX total':'Suma de personal, gastos fijos y gastos variables de todos los períodos.',
      'CAPEX total':'Suma de inversiones iniciales y reposiciones durante todo el horizonte.',
      'Reposiciones CAPEX':'Importe acumulado de compras de activos para reemplazar los que terminaron su vida económica.',
      'SAC total':'Total de aguinaldos calculados y pagados por toda la nómina a lo largo del proyecto.',
      'ROI simple':'Relación simplificada entre el resultado neto de caja total y el CAPEX. No considera el descuento temporal.',
      'Tasa por período':'Tasa equivalente mensual o anual que se utiliza para descontar cada flujo.',
      'Inflación por período':'Inflación equivalente para cada mes o año, derivada de la tasa anual indicada.',
      'Capital de trabajo máximo':'Necesidad neta máxima de capital de trabajo en el horizonte (no suma de todos los meses).',
      'Capital previo a operación':'Mayor capital neto comprometido antes de la primera venta.',
      'Liquidación final de capital':'Saldo neto de clientes, stock y proveedores que se recupera o cancela al cierre de la evaluación.'
    },
    flow:{
      'Período':'Mes o año de la evaluación. El 0 corresponde al instante inicial.',
      'Producción':'Unidades producidas para ventas externas y/o autoconsumo. Para costos unitarios, todos los productos deben expresarse en una unidad compatible.',
      'Ingresos':'Ventas externas: cantidad vendida por precio nominal. No incluye autoconsumo.',
      'Compras evitadas':'Beneficio incremental equivalente al costo de compra externa del producto que se fabrica para consumo propio.',
      'Beneficios totales':'Suma de ingresos externos y compras evitadas. Es la base económica incremental del proyecto.',
      'Sueldos + cargas + SAC':'Costo laboral total del período: sueldos, SAC proporcional y cargas sociales. El SAC se liquida al cierre del semestre o del contrato.',
      'SAC abonado':'Aguinaldo pagado dentro del período. Se calcula proporcional a los meses trabajados de cada semestre.',
      'CAPEX de reposición':'Parte del CAPEX destinada a reemplazar activos que agotaron su vida económica.',
      'Venta de usados':'Importe recuperado cuando se reemplaza un activo, antes de gravámenes por venta.',
      'Gastos fijos':'Egresos independientes del nivel de ventas o producción.',
      'Gastos variables':'Egresos proporcionales a unidades vendidas o a ingresos.',
      'EBITDA':'Beneficios económicos (ventas y/o compras evitadas) menos los costos incrementales de operación, antes de depreciación, intereses e impuestos. En autoconsumo es un indicador incremental, no EBITDA contable de una empresa independiente.',
      'Depreciación':'Pérdida contable de valor de los activos. Afecta impuestos, pero no es una salida de caja.',
      'Impuestos':'Impuesto calculado sobre la utilidad imponible del período.',
      'CAPEX':'Inversiones de capital pagadas en este período.',
      'Ctas. por cobrar':'Importe de ventas que aún no cobraste, estimado según días de cobro.',
      'Inventarios':'Insumos almacenados valorados a su costo, según días de inventario y compras futuras.',
      'Ctas. por pagar':'Facturas pendientes con proveedores, calculadas desde los costos marcados como compras a crédito.',
      'Saldo cap. trabajo':'Capital de trabajo operativo neto: cuentas por cobrar + inventarios − cuentas por pagar. Puede ser negativo.',
      'Δ cap. trabajo':'Variación entre el saldo de este mes y el anterior. Si aumenta, consume caja; si baja, libera caja.',
      'Recup. + residual':'Liquidación de capital de trabajo y valor residual en el mes final. Si hay deuda comercial neta, el ajuste puede ser negativo.',
      'Flujo libre':'Caja neta disponible en el período después de ingresos, egresos, impuestos, inversiones y capital de trabajo.',
      'Flujo desc.':'Flujo libre dividido por el factor de descuento correspondiente al período.',
      'Acumulado':'Suma de los flujos libres desde el período 0 hasta el actual.',
      'Acum. descontado':'Suma de los flujos descontados desde el período 0 hasta el actual.'
    }
  };
  function helpLabel(label,scope,key,id){const info=glossary[scope]?.[key];return `<div class="field-heading"><label for="${esc(id)}" ${info?`data-help="${esc(info)}" tabindex="0"`:''}>${esc(label)}</label>${info?`<button type="button" class="help-trigger" data-help="${esc(info)}" aria-label="¿Qué significa ${esc(label)}?">i</button>`:''}</div>`}
  function inlineHelp(label,group='result'){const info=glossary[group]?.[label];return info?`<span class="inline-help" tabindex="0" data-help="${esc(info)}" aria-label="${esc(label)}. ${esc(info)}">${esc(label)} <span class="help-icon" aria-hidden="true">i</span></span>`:esc(label)}
  const helpTooltip=$('#field-tooltip');
  let helpTarget=null;
  function hideHelp(){if(helpTarget)helpTarget.removeAttribute('aria-describedby');helpTarget=null;helpTooltip.hidden=true}
  function showHelp(target){if(!target?.dataset.help)return;hideHelp();helpTarget=target;helpTooltip.textContent=target.dataset.help;helpTooltip.hidden=false;target.setAttribute('aria-describedby','field-tooltip');const rect=target.getBoundingClientRect(),box=helpTooltip.getBoundingClientRect();const left=Math.max(12,Math.min(rect.left+rect.width/2-box.width/2,window.innerWidth-box.width-12));let top=rect.bottom+9;if(top+box.height>window.innerHeight-12&&rect.top>box.height+9)top=rect.top-box.height-9;helpTooltip.style.left=left+'px';helpTooltip.style.top=Math.max(8,top)+'px'}
  document.addEventListener('mouseover',e=>{const target=e.target.closest?.('[data-help]');if(target&&target!==helpTarget)showHelp(target)});
  document.addEventListener('pointermove',e=>{const target=e.target.closest?.('[data-help]');if(target&&target!==helpTarget)showHelp(target)});
  document.addEventListener('mouseout',e=>{const target=e.target.closest?.('[data-help]');if(target&&target===helpTarget&&!target.contains(e.relatedTarget))hideHelp()});
  document.addEventListener('focusin',e=>{const target=e.target.closest?.('[data-help]');if(target)showHelp(target)});
  document.addEventListener('focusout',e=>{if(e.target===helpTarget)hideHelp()});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')hideHelp()});
  document.addEventListener('pointerdown',e=>{if(helpTarget&&!e.target.closest?.('[data-help]'))hideHelp()});
  window.addEventListener('scroll',hideHelp,true);
  window.addEventListener('resize',hideHelp);
  const tip=(label,text)=>`<div class="flex justify-between items-center gap-3 mb-3"><div><h2 class="text-lg font-extrabold tracking-tight">${label}</h2><p class="text-xs muted mt-1">${text}</p></div></div>`;
  function field(label,scope,key,value,opts={}){const ty=opts.type||'number',step=opts.step??'any',min=opts.min??0,max=opts.max??'',hint=opts.hint||'',choices=opts.choices,id=`fld-${scope}-${key}`;
    return `<div class="field">${helpLabel(label,scope,key,id)}${choices?`<select id="${id}" class="ctrl" data-scope="${scope}" data-key="${key}">${choices.map(([v,t])=>`<option value="${esc(v)}" ${String(value)===String(v)?'selected':''}>${esc(t)}</option>`).join('')}</select>`:`<input id="${id}" class="ctrl" type="${ty}" data-scope="${scope}" data-key="${key}" value="${esc(value)}" ${ty==='number'?`step="${step}" min="${min}" ${max!==''?`max="${max}"`:''}`:''}>`}${hint?`<p class="text-[11px] muted">${esc(hint)}</p>`:''}</div>`}
  function itemInput(group,i,key,value,label,opts={}){let type=opts.type||'number',choices=opts.choices,id=`fld-${group}-${i}-${key}`;return `<div class="field">${helpLabel(label,group,key,id)}${choices?`<select id="${id}" class="ctrl" data-group="${group}" data-index="${i}" data-key="${key}">${choices.map(([a,b])=>`<option value="${esc(a)}" ${String(a)===String(value)?'selected':''}>${esc(b)}</option>`).join('')}</select>`:`<input id="${id}" class="ctrl" type="${type}" value="${esc(value)}" ${group==='staff'&&key==='end'&&model.staff[i].endMode!=='temporal'?'disabled':''} data-group="${group}" data-index="${i}" data-key="${key}" ${type==='number'?`step="any" min="${['volumeGrowth','priceGrowth','referencePriceGrowth','salaryGrowthAnnual','replacementGrowthAnnual'].includes(key)?-99:0}"`:''}>`}</div>`}
  function items(group,columns,summary){const list=model[group];return `<section class="panel p-4 sm:p-6"><div class="flex justify-between gap-3 flex-wrap items-center mb-5"><div><h3 class="font-extrabold">Detalle de conceptos</h3><p class="text-xs muted mt-1">Podés modificar, agregar o eliminar filas.</p></div><span class="tag tag-blue">${list.length} conceptos</span></div><div class="space-y-3">${list.length?list.map((item,i)=>`<div class="item-card"><div class="flex justify-between gap-3 items-center mb-4"><div class="text-xs font-bold text-slate-400">Concepto ${i+1}</div><button class="btn btn-ghost !px-2 !py-1 text-red-600" data-delete="${group}" data-index="${i}" aria-label="Eliminar concepto ${i+1}">✕ Eliminar</button></div><div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-${Math.min(columns.length,4)} gap-3">${columns.map(c=>itemInput(group,i,c.key,item[c.key],c.label,c)).join('')}</div></div>`).join(''):`<div class="text-center p-10 muted text-sm">Todavía no hay conceptos. Agregá el primero.</div>`}</div><div class="mt-5 flex gap-3 justify-between items-center flex-wrap"><button class="btn btn-white" data-add="${group}">＋ Agregar concepto</button><div class="text-sm font-bold" id="section-summary">${summary}</div></div></section>`}
  const help=(title,content)=>`<div class="panel p-5"><div class="text-xs uppercase tracking-wider font-extrabold text-slate-400 mb-2">Nota de modelado</div><h3 class="font-extrabold mb-2">${title}</h3><p class="text-sm text-slate-600 leading-relaxed">${content}</p></div>`;
  function pageGeneral(){const m=model.meta;return `<section class="mb-6">${title('Datos generales','Definí la identidad del proyecto y los parámetros que gobiernan todo el modelo.')}</section><div class="grid grid-cols-1 xl:grid-cols-[1.7fr_1fr] gap-5"><div class="panel p-5 sm:p-7 space-y-6">${tip('Ficha del proyecto','Información para identificar y recuperar la evaluación.')}
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">${field('Nombre del proyecto','meta','name',m.name,{type:'text'})}${field('Fecha de inicio','meta','startDate',m.startDate,{type:'date'})}<div class="sm:col-span-2">${field('Descripción / alcance','meta','description',m.description,{type:'text'})}</div></div>
    <div class="border-t pt-5">${tip('Modalidad del proyecto','Elegí cómo se genera el beneficio económico. Los pasos se adaptarán sin borrar información previamente cargada.')}
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">${[['commercial','Comercial','Ventas externas a clientes','↗'],['self','Autoconsumo','Ahorro por compras sustituidas','◈'],['mixed','Mixto','Ventas y consumo interno','⇄']].map(([v,label,desc,icon])=>`<label class="mode-card ${m.projectType===v?'chosen':''}"><input type="radio" class="sr-only" name="projectType" data-scope="meta" data-key="projectType" value="${v}" ${m.projectType===v?'checked':''}><span class="text-xl">${icon}</span><span class="block font-extrabold text-sm">${label}</span><span class="block text-xs text-slate-500 leading-relaxed mt-1">${desc}</span></label>`).join('')}</div>
    <p class="mt-3 text-xs muted">${m.projectType==='self'?'Se pedirán las cantidades para uso propio y el precio de compra externa que evitás. No se inventarán ventas ni cuentas por cobrar.':m.projectType==='mixed'?'En el paso 5 cargarás por separado ventas externas y consumo propio. El beneficio sumará ambas contribuciones sin duplicar unidades.':'En el paso 5 cargarás los productos y sus precios de venta.'}</p></div>
    <div class="border-t pt-5">${tip('Configuración financiera','La periodicidad determina los importes operativos, el horizonte y la tasa utilizada en el VAN.')}
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">${field('Moneda','meta','currency',m.currency,{choices:[['ARS','ARS · Peso argentino'],['USD','USD · Dólar estadounidense'],['EUR','EUR · Euro'],['BRL','BRL · Real brasileño']]})}${field('Períodos','meta','frequency',m.frequency,{choices:[['monthly','Mensuales'],['annual','Anuales']]})}${field('Cantidad de períodos','meta','periods',m.periods,{step:1,min:1,max:360,hint:m.frequency==='monthly'?'Máximo: 360 meses.':'Máximo: 60 años.'})}${field('Tasa de descuento anual (%)','meta','discountAnnual',m.discountAnnual,{min:-99,max:100000,hint:'WACC / costo de oportunidad, efectiva anual.'})}${field('Inflación anual esperada (%)','meta','inflationAnnual',m.inflationAnnual,{min:-99,max:100000,hint:'Equivalente anual; sueldos, operaciones y reposiciones se escalan.'})}</div></div><div class="border-t pt-5">${tip('Construcción y puesta en marcha','Los meses de construcción no generan ventas, pero sí inversiones, personal y gastos programados.')}<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">${field('Duración de construcción (meses)','meta','constructionMonths',m.constructionMonths,{step:1,max:720})}${field('Meses de puesta en régimen','meta','rampMonths',m.rampMonths,{step:1,min:1,max:120})}${field('Capacidad en el primer mes (%)','meta','rampStartPct',m.rampStartPct,{min:0,max:100})}</div><p class="text-xs muted mt-3">Inicio estimado de operación: mes ${Math.round(n(m.constructionMonths))+1}. Horizonte: ${m.frequency==='monthly'?Math.round(n(m.periods)):Math.round(n(m.periods))*12} meses incluyendo construcción.</p></div></div>
    <div class="space-y-4">${help('Dos ventanas siempre disponibles','«Datos generales» muestra los supuestos globales y «Resultados» permite consultar el tablero y los flujos en cualquier momento. Las etapas intermedias se recorren libremente.')}
    <div class="panel p-5"><div class="font-bold mb-3">Estado de la evaluación</div><div class="grid grid-cols-2 gap-3">${statusBox('CAPEX',model.capex.length+' rubros')}${statusBox('Personal',model.staff.length+' puestos')}${statusBox('Fijos',model.fixed.length+' rubros')}${statusBox('Variables',model.variable.length+' rubros')}${statusBox('Ventas',hasSales()?model.products.length+' productos':'No aplica')}${statusBox('Autoconsumo',hasSelfUse()?model.selfUse.length+' productos':'No aplica')}${statusBox('Horizonte',fmt(m.periods)+' '+periodPlural())}</div><div class="pt-5 flex flex-wrap gap-2"><button class="btn btn-primary" data-nav="capex">Comenzar carga →</button><button class="btn btn-white" data-action="import-json">Importar JSON</button></div></div></div></div>`}
  function statusBox(name,val){return `<div class="bg-slate-50 rounded-xl p-3"><div class="text-xs muted">${name}</div><div class="font-extrabold text-sm mt-1">${val}</div></div>`}
  function title(name,description){return `<div class="flex flex-wrap gap-3 items-start justify-between"><div><div class="uppercase tracking-widest text-xs text-blue-700 font-extrabold mb-2">EVALUACIÓN ECONÓMICA</div><h1 class="text-2xl sm:text-3xl font-extrabold tracking-tight">${name}</h1><p class="text-sm muted mt-2 max-w-3xl">${description}</p></div><button class="btn btn-white no-print" data-nav="results">↗ Vista de resultados</button></div>`}
  function periodHelp(){return `<span class="font-semibold">${model.meta.frequency==='monthly'?'mes':'año'}</span>`}
  function stepPage(page){const r=compute(),m=model.meta,descriptions={capex:'Registrá todas las inversiones y el período en el que ocurren.',staff:'Detallá la plantilla, salarios mensuales y costos laborales asociados.',fixed:'Ingresá los egresos que no dependen directamente del volumen producido.',variable:'Definí costos calculados por unidad vendida o como porcentaje de facturación.',revenue:'Definí ventas externas y/o ahorros por sustituir compras, según la modalidad elegida.',finance:'Definí los tributos y otros ajustes necesarios para el flujo libre.'};
    let content='';
    if(page==='capex')content=items('capex',[
      {key:'name',label:'Concepto',type:'text'},
      {key:'category',label:'Categoría',choices:[['Equipamiento','Equipamiento'],['Vehículos','Vehículos'],['Obra civil','Obra civil'],['Instalaciones','Instalaciones'],['Otros','Otros']]},
      {key:'amount',label:`Importe inicial (${m.currency})`},
      {key:'at',label:`${m.frequency==='monthly'?'Mes':'Año'} de desembolso (0–${m.periods})`},
      {key:'life',label:'Vida contable / depreciación (años)'},
      {key:'replace',label:'¿Reponer automáticamente?',choices:[['no','No'],['yes','Sí']]},
      {key:'economicLife',label:'Vida útil económica (años)'},
      {key:'replacementGrowthAnnual',label:'Variación REAL del precio de reposición (%/año)'},
      {key:'resalePct',label:'Recupero por venta del usado (% valor nuevo)'}
    ],`CAPEX total incl. reposiciones: ${money(r.invest)}`)+help('Reposición de vehículos y equipos','La compra inicial se registra en el mes/año seleccionado. Si activás la reposición, se programan compras al vencer la vida económica, ajustando el precio por inflación y variación real. La vida contable solo define la depreciación. Podés recuperar parte del valor al vender el usado.');
    if(page==='staff')content=`<section class="panel p-5 sm:p-6 mb-4">${tip('Reglas de personal y aguinaldo','El SAC argentino se paga semestralmente y se prorratea por los meses efectivamente trabajados.')}
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">${field('Cargas sociales (%)','finance','social',model.finance.social)}${field('Calcular SAC argentino','finance','sacEnabled',String(model.finance.sacEnabled),{choices:[['true','Sí · por semestre'],['false','No']]})}<div class="field"><label class="text-xs font-bold text-slate-500">Sueldo base</label><div class="ctrl bg-slate-50">Mensual por persona</div></div></div>
      <p class="text-xs muted mt-3">Semestres: enero–junio y julio–diciembre. Se paga al finalizar junio o diciembre, o al terminar el contrato. Si el proyecto termina a mitad de semestre, se incluye el SAC acumulado del personal en el último mes.</p></section>`+items('staff',[
      {key:'name',label:'Puesto',type:'text'},
      {key:'qty',label:'Cantidad'},
      {key:'salary',label:`Sueldo mensual (${m.currency})`},
      {key:'start',label:'Mes de incorporación al proyecto'},
      {key:'endMode',label:'Duración del puesto',choices:[['indefinido','Hasta fin del proyecto'],['temporal','Temporal · indicar fin']]},
      {key:'end',label:'Último mes trabajado (si temporal)'},
      {key:'salaryGrowthAnnual',label:'Aumento salarial REAL (% anual)'}
    ],`SAC total en el horizonte: ${money(r.sac)}`)+help('SAC proporcional, sin duplicarlo','Ejemplo: si un operario entra en mayo, trabajó dos de los seis meses de enero–junio. Cobra en junio 2/6 del 50 % de su mejor sueldo mensual. La carga social se calcula también sobre el SAC. El mes del puesto se cuenta desde la fecha inicial del proyecto, incluso cuando el flujo se visualiza por años.');
    if(page==='fixed')content=items('fixed',[{key:'name',label:'Concepto',type:'text'},{key:'amount',label:`Importe por ${periodWord()} (${m.currency})`},{key:'start',label:'Período de inicio'},{key:'supplierCredit',label:'¿Pago a proveedor a crédito?',choices:[['no','No · pago inmediato'],['yes','Sí · pago diferido']]}],`Base por período: ${money(model.fixed.reduce((s,a)=>s+n(a.amount),0))}`)+help('Gastos fijos','Son independientes del nivel de producción: alquiler, servicios mínimos, vigilancia, seguros, administración, etc. Se aplican desde el período indicado y se ajustan por inflación.');
    if(page==='variable')content=items('variable',[{key:'name',label:'Concepto',type:'text'},{key:'driver',label:'Forma de cálculo',choices:[['units','Costo por unidad producida'],['revenue','% de ventas externas'],['benefits','% de beneficios económicos']]},{key:'amount',label:'Costo unitario o porcentaje'},{key:'start',label:'Período de inicio'},{key:'inventoryEligible',label:'¿Insumo almacenable?',choices:[['no','No'],['yes','Sí · inventario']]},{key:'supplierCredit',label:'¿Pago a proveedor a crédito?',choices:[['no','No · pago inmediato'],['yes','Sí · pago diferido']]}],`Rubros cargados: ${model.variable.length}`)+help('Costos variables','El costo por unidad se aplica a toda la producción: ventas y autoconsumo. Asegurate de que los productos estén expresados en unidades compatibles. Para porcentajes, elegí explícitamente ventas externas o beneficios económicos (ventas + compras evitadas).');
    if(page==='revenue'){
      const commercialPanel=hasSales()?`<div class="mb-4"><div class="font-extrabold mb-2 text-lg">Ventas externas</div><p class="text-xs muted mb-3">Solo unidades efectivamente vendidas a terceros, nunca las consumidas internamente.</p></div>`+items('products',[{key:'name',label:'Producto o servicio',type:'text'},{key:'quantity',label:`Cantidad vendida por ${periodWord()}`},{key:'price',label:`Precio de venta unitario (${m.currency})`},{key:'start',label:'Comienza en período'},{key:'volumeGrowth',label:'Crecimiento volumen (% anual)'},{key:'priceGrowth',label:'Variación precio real (% anual)'}],`Ventas externas: ${money(r.revenue)}`):'';
      const ownPanel=hasSelfUse()?`<div class="mb-4 ${hasSales()?'mt-8':''}"><div class="font-extrabold mb-2 text-lg">Producción para autoconsumo</div><p class="text-xs muted mb-3">El beneficio es lo que evitás pagar por comprar un producto equivalente. No representa facturación y no genera cuentas por cobrar.</p></div>`+items('selfUse',[{key:'name',label:'Producto de uso interno',type:'text'},{key:'quantity',label:`Cantidad autoconsumida por ${periodWord()}`},{key:'referencePrice',label:`Precio de compra externa evitada (${m.currency}/unidad)`},{key:'start',label:'Comienza en período'},{key:'volumeGrowth',label:'Crecimiento de volumen (% anual)'},{key:'referencePriceGrowth',label:'Variación precio externo REAL (% anual)'}],`Compras evitadas: ${money(r.savings)}`):'';
      content=`<div class="okay mb-4"><strong>${modeLabel()}.</strong> ${hasSales()&&hasSelfUse()?'Separá las cantidades destinadas a clientes de las que utiliza tu propia operación.':hasSelfUse()?'Registrá el costo externo que evitás, sin inventar una venta.':'Registrá las cantidades y precios de venta a clientes.'}</div>`+commercialPanel+ownPanel+help('Cálculo incremental de beneficios',`Beneficio = ${hasSales()?'ventas externas':''}${hasSales()&&hasSelfUse()?' + ':''}${hasSelfUse()?'compras externas evitadas':''}. Los costos de producir esas unidades siguen registrándose en Personal, Gastos fijos y Gastos variables. Si usás soja propia, valorala por su costo de oportunidad; no registres el mismo ahorro o gasto dos veces. El capital de trabajo automático solo crea cuentas por cobrar sobre ventas externas.`);
    }
    if(page==='finance'){
      const finance=model.finance, auto=finance.workingCapitalMode==='automatic';
      const wcPreview=`<section class="panel p-5 sm:p-7"><div class="flex justify-between items-center gap-3 flex-wrap mb-4"><div><h3 class="text-lg font-extrabold">Capital de trabajo estimado</h3><p class="text-xs muted mt-1">${auto?'Cálculo automático desde ventas, existencias y créditos de proveedores.':'Importe indicado manualmente, sin detalle de cuentas.'}</p></div><span class="tag tag-blue">${auto?'Automático':'Manual'}</span></div>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">${statusBox('Mayor necesidad neta',money(r.wcPeak))}${statusBox('Antes de la primera venta',money(r.wcPreOpening))}${statusBox('Liquidación neta al cierre',money(r.wcClosing))}</div>
      <p class="text-xs muted mt-4">La liquidación puede ser negativa si el proyecto termina debiendo más a proveedores de lo que tiene por cobrar y en inventario. Se calcula en cada mes y aparece en Resultados. Para estimar inventarios y compras a plazo, clasificá los rubros de Gastos variables y Gastos fijos.</p></section>`;
      content=`<div class="panel p-5 sm:p-7">${tip('Impuestos','Impuesto estimado sobre la utilidad fiscal del proyecto.')}
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">${field('Impuesto sobre la renta (%)','finance','tax',finance.tax)}<div class="field">${helpLabel('Compensar pérdidas fiscales futuras','finance','lossCarry','finance-lossCarry')}<select id="finance-lossCarry" class="ctrl" data-scope="finance" data-key="lossCarry"><option value="true" ${finance.lossCarry?'selected':''}>Sí, arrastrar pérdidas</option><option value="false" ${!finance.lossCarry?'selected':''}>No</option></select></div>${field('Valor residual (% CAPEX base)','finance','residualPct',finance.residualPct,{hint:'Se cobra al cierre del proyecto. No duplicar valores de reventa.'})}</div></div>
      <div class="panel p-5 sm:p-7">${tip('Capital de trabajo','En lugar de adivinar un % de ventas, calculá cuánto queda por cobrar, cuánto stock necesitás y cuánto te financian los proveedores.')}
      <div class="max-w-md mb-5">${field('Método de cálculo','finance','workingCapitalMode',finance.workingCapitalMode,{choices:[['automatic','Automático · días de cobro, stock y pagos'],['manual_amount','Manual · importe total'],['percent','Manual · porcentaje de ventas (legado)']]})}</div>
      ${auto?`<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">${hasSales()?field('¿A cuántos días cobrás?','finance','daysReceivable',finance.daysReceivable,{step:1,min:0,max:365,hint:'0 = contado. Ej.: 30 días de cobro.'}):`<div class="field"><label>Cuentas por cobrar</label><div class="p-3 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-600">No aplica: el autoconsumo no genera ventas a crédito.</div></div>`}${field('¿Cuántos días de inventario?', 'finance','daysInventory',finance.daysInventory,{step:1,min:0,max:365,hint:'Stock de insumos a su costo; no son ventas.'})}${field('¿A cuántos días pagás proveedores?', 'finance','daysPayable',finance.daysPayable,{step:1,min:0,max:365,hint:'0 = contado. Solo partidas marcadas como crédito.'})}</div>
      <div class="bg-blue-50 border border-blue-100 rounded-xl p-4 mt-5 text-sm text-blue-950 leading-relaxed"><strong>¿Cómo se calcula?</strong><div class="mt-2">Capital de trabajo = cuentas por cobrar + inventario − cuentas por pagar.</div><div class="text-xs mt-2">Los valores predeterminados (30, 15 y 30 días) son ejemplos para configurar, <strong>no</strong> datos confirmados de tu proyecto. Para que el inventario y los pagos diferidos se calculen, marcá los conceptos correspondientes en los pasos de gastos.</div></div>`:
      finance.workingCapitalMode==='manual_amount'?`<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">${field(`Capital de trabajo inicial (${m.currency})`,'finance','manualWorkingCapitalAmount',finance.manualWorkingCapitalAmount,{hint:'Se inmoviliza en el período 0 y se recupera al cierre. No es un gasto operativo.'})}</div>`:
      `<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">${field('Capital de trabajo (% de ventas)', 'finance','workingCapitalPct',finance.workingCapitalPct,{hint:'Método antiguo, aplicado a las ventas del mes. Recomendamos el automático.'})}</div><div class="warning mt-4">Este método no identifica plazos de cobro ni financiamiento de proveedores. Puede ser menos representativo para proyectos con construcción.</div>`}</div>
      ${wcPreview}`+help('Capital de trabajo sin duplicar gastos','Los insumos, sueldos y otros costos ya se restan una sola vez en el OPEX. Para obtener la caja, el programa resta además solo la VARIACIÓN de cuentas por cobrar, inventarios y cuentas por pagar. Puede anticipar compras de stock al mes de puesta en marcha o al período 0. En el último mes se supone que se liquidan todos los saldos, lo cual es una simplificación a validar.');
    }
    const i=steps.findIndex(s=>s.id===page);
    return `<section class="mb-6">${title('Paso '+(i+1)+' · '+stepLabel(page),descriptions[page])}</section><div class="flex items-center gap-3 mb-5"><div class="bg-slate-200 h-2 flex-1 rounded-full overflow-hidden"><div class="bg-blue-600 h-full rounded-full" style="width:${(i+1)/steps.length*100}%"></div></div><div class="text-xs font-bold muted">${i+1} / ${steps.length}</div></div><div class="space-y-4">${content}</div><div id="wizard-footer" class="flex gap-3 justify-between mt-7 pt-6 border-t border-slate-200"><button class="btn btn-white" data-nav="${i===0?'general':steps[i-1].id}">← Anterior</button><button class="btn btn-primary" data-nav="${i===steps.length-1?'results':steps[i+1].id}">${i===steps.length-1?'Ver resultados':'Siguiente etapa'} →</button></div>`}
  function results(){const r=compute(),lines=r.lines,irr=r.irrAnnual.length===1?pct(r.irrAnnual[0]):r.irrAnnual.length>1?'Múltiples TIR':'No definida',pay=r.invest<=0?'Sin inversión':r.payback===null?'No recuperada':`${fmt(r.payback,2)} ${periodPlural()}`,discountPay=r.invest<=0?'Sin inversión':r.discountPayback===null?'No recuperada':`${fmt(r.discountPayback,2)} ${periodPlural()}`;
    const card=(name,value,subtitle,color='slate')=>`<article class="metric border-t-4 ${color==='green'?'border-t-emerald-500':color==='red'?'border-t-rose-500':'border-t-blue-500'}"><p class="text-xs uppercase tracking-wide font-bold text-slate-500">${inlineHelp(name)}</p><div class="value mt-3 ${color==='green'?'text-emerald-700':color==='red'?'text-rose-700':'text-slate-800'}">${value}</div><p class="hint">${subtitle}</p></article>`;
    const scenario=model.scenario;
    return `${title('Resultados del proyecto','Indicadores y flujos según la modalidad '+modeLabel().toLowerCase()+'. Podés cambiar cualquier parámetro y volver acá inmediatamente.')}
      <div class="flex items-center flex-wrap gap-3 my-6 no-print"><div class="text-sm font-bold">${inlineHelp('Escenario:','result')}</div><select id="scenario-select" class="ctrl !w-auto" data-scope="scenario" data-key="selected"><option value="base" ${scenario.selected==='base'?'selected':''}>Base</option><option value="optimista" ${scenario.selected==='optimista'?'selected':''}>Optimista</option><option value="pesimista" ${scenario.selected==='pesimista'?'selected':''}>Conservador</option></select><button class="btn btn-white" data-action="export-csv">↓ Exportar CSV</button><button class="btn btn-white" data-action="print">⎙ Imprimir informe</button><button class="btn btn-white" data-nav="general">Editar datos generales</button></div>
      <section class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4 mb-5">${card('Valor actual neto (VAN)',money(r.npv),`Tasa anual: ${pct(model.meta.discountAnnual)}`,r.npv>=0?'green':'red')}${card('Tasa interna de retorno (TIR)',irr,r.irrAnnual.length===1?`TIR efectiva anual · ${r.irrAnnual[0]>n(model.meta.discountAnnual)?'supera':'no supera'} WACC`:'Ver diagnóstico debajo',r.irrAnnual.length===1?(r.irrAnnual[0]>n(model.meta.discountAnnual)?'green':'red'):'slate')}${card('Repago simple',pay,'Interpolación dentro del primer período recuperado')}${card('Repago descontado',discountPay,'Considera el costo del capital')}</section>
      <div class="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-5"><section class="panel p-5 xl:col-span-2"><div class="flex items-center justify-between gap-3 mb-4"><div><h2 class="font-extrabold">Flujos de caja</h2><p class="text-xs muted mt-1">Flujo libre por período y acumulado</p></div><span class="tag tag-blue">${model.meta.currency}</span></div><div class="chart-wrap relative h-[280px] sm:h-[330px]"><canvas id="cashflow-chart" aria-label="Gráfico de flujos de caja" role="img"></canvas></div></section>
        <section class="panel p-5"><h2 class="font-extrabold mb-4">Resumen económico</h2><div class="space-y-3">${hasSales()?summaryRow('Ventas acumuladas',money(r.revenue)):''}${hasSelfUse()?summaryRow('Ahorros por autoconsumo',money(r.savings)):''}${summaryRow('Beneficios económicos',money(r.benefits))}${summaryRow('OPEX total',money(r.costs))}${summaryRow('CAPEX total',money(r.invest))}${summaryRow('Reposiciones CAPEX',money(r.replacementInvest))}${summaryRow('SAC total',money(r.sac))}${summaryRow('Capital de trabajo máximo',money(r.wcPeak))}${summaryRow('Capital previo a operación',money(r.wcPreOpening))}${summaryRow('Liquidación final de capital',money(r.wcClosing))}${summaryRow('ROI simple',r.roi===null?'—':pct(r.roi))}${summaryRow('Tasa por período',pct(r.periodRate*100))}${summaryRow('Inflación por período',pct(r.periodInflation*100))}</div><div class="mt-5 text-xs muted leading-relaxed">Los importes son nominales. El VAN utiliza tasas por período equivalentes a las tasas anuales configuradas.</div></section></div>
      ${r.irrAnnual.length>1?`<div class="warning mb-5"><strong>Flujos no convencionales:</strong> se detectaron ${r.irrAnnual.length} tasas internas de retorno: ${r.irrAnnual.map(pct).join(' · ')}. La TIR no es un criterio único en este caso; priorizá el VAN.</div>`:r.irrAnnual.length===0?`<div class="warning mb-5"><strong>TIR no disponible:</strong> no se encontró una solución real dentro del rango numérico analizado, o los flujos no permiten calcularla. El VAN sigue siendo válido.</div>`:''}
      <div class="text-xs muted mb-3">Modalidad: <strong>${modeLabel()}</strong>. ${hasSelfUse()?'Las compras evitadas se tratan como beneficio económico incremental, no como ventas ni cobros de clientes.':''}</div>
      ${warnings().map(w=>`<div class="warning mb-3">⚠ ${esc(w)}</div>`).join('')}
      <section class="panel p-5 sm:p-6 mt-5 mb-5"><div class="flex items-start flex-wrap gap-4 justify-between mb-4"><div><h2 class="font-extrabold text-lg">Flujo de fondos detallado</h2><p class="text-xs muted mt-1">Desplazá horizontalmente para ver todas las partidas. Los importes corresponden a ${model.meta.currency}.</p></div><span class="tag tag-blue">${lines.length} filas · período 0 incluido</span></div>
      <div class="overflow-x-auto rounded-xl border border-slate-200"><table class="mini-table"><thead><tr>${['Período','Producción','Ingresos','Compras evitadas','Beneficios totales','Sueldos + cargas + SAC','SAC abonado','Gastos fijos','Gastos variables','EBITDA','Depreciación','Impuestos','CAPEX','CAPEX de reposición','Venta de usados','Ctas. por cobrar','Inventarios','Ctas. por pagar','Saldo cap. trabajo','Δ cap. trabajo','Recup. + residual','Flujo libre','Flujo desc.','Acumulado','Acum. descontado'].map(a=>`<th>${inlineHelp(a,'flow')}</th>`).join('')}</tr></thead><tbody>${lines.map(l=>`<tr>${[l.t,fmt(l.units),fmt(l.revenue),fmt(l.savings),fmt(l.benefits),fmt(l.staff),fmt(l.bonus),fmt(l.fixed),fmt(l.variable),fmt(l.ebitda),fmt(l.depreciation),fmt(l.taxes),fmt(l.capex),fmt(l.replacementCapex),fmt(l.resale),fmt(l.receivables),fmt(l.inventory),fmt(l.payables),fmt(l.wcBalance),fmt(l.deltaWC),fmt(l.releaseWC+l.residual),fmt(l.freeCash),fmt(l.discount),fmt(l.cumulative),fmt(l.discountCum)].map((v,i)=>`<td>${v}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>
      <section class="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-6"><div class="panel p-5"><h2 class="font-extrabold mb-1">Sensibilidad del VAN</h2><p class="text-xs muted mb-4">Variamos un supuesto por vez sobre el escenario seleccionado.</p><div class="overflow-x-auto"><table class="mini-table w-full"><thead><tr><th>Factor</th><th>Caso desfavorable</th><th>Base</th><th>Caso favorable</th></tr></thead><tbody>${sensitivityRows(r).map(a=>`<tr><td>${a[0]}</td><td>${money(a[1])}</td><td>${money(r.npv)}</td><td>${money(a[2])}</td></tr>`).join('')}</tbody></table></div></div>
      <div class="panel p-5"><h2 class="font-extrabold mb-1">Configuración de escenarios</h2><p class="text-xs muted mb-4">Las variaciones son porcentajes respecto del caso base.</p><div class="grid grid-cols-2 sm:grid-cols-3 gap-3">${[['priceOptimistic','Precio optimista (%)'],['costOptimistic','Costo optimista (%)'],['capexOptimistic','CAPEX optimista (%)'],['pricePessimistic','Precio conservador (%)'],['costPessimistic','Costo conservador (%)'],['capexPessimistic','CAPEX conservador (%)']].map(([k,l])=>field(l,'scenario',k,scenario[k],{min:-99})).join('')}</div></div></section>
      <div class="print-only text-sm">Modelo elaborado con EvalPro · ${esc(model.meta.name)} · Fecha de inicio: ${esc(model.meta.startDate)}</div>`}
  function summaryRow(name,value){return `<div class="flex justify-between items-start gap-2 border-b border-slate-100 pb-2"><span class="text-xs muted">${inlineHelp(name)}</span><span class="text-sm font-bold text-right">${value}</span></div>`}
  function sensitivityRows(base){const s=configScenario();const vals=[['Precios venta / compras evitadas (±10 %)',compute({...s,price:s.price*.9}).npv,compute({...s,price:s.price*1.1}).npv],['Costos operativos (±10 %)',compute({...s,cost:s.cost*1.1}).npv,compute({...s,cost:s.cost*.9}).npv],['CAPEX (±10 %)',compute({...s,capex:s.capex*1.1}).npv,compute({...s,capex:s.capex*.9}).npv]];
    // WACC: cálculo directo sobre los mismos flujos, sin alterar la operación del proyecto.
    const wacc=(delta)=>{const r=Math.pow(1+(n(model.meta.discountAnnual)+delta)/100,1/12)-1;return base.monthly.reduce((sum,l)=>sum+l.freeCash/Math.pow(1+r,l.t),0)};
    vals.push(['WACC anual (±5 puntos)',wacc(5),wacc(-5)]);return vals}
  function renderChart(r){const canvas=$('#cashflow-chart');if(!canvas||typeof Chart==='undefined'){if(canvas){canvas.parentElement.innerHTML='<p class="text-sm muted">Gráfico no disponible. Verificá la conexión al CDN de Chart.js.</p>'}return}
    if(chart){chart.destroy();chart=null}
    const labels=r.lines.map(l=>(l.t===0?'Inicio':`${l.t} ${model.meta.frequency==='monthly'?'m':'a'}`));
    chart=new Chart(canvas,{type:'bar',data:{labels,datasets:[{type:'bar',label:'Flujo libre',data:r.lines.map(l=>l.freeCash),backgroundColor:r.lines.map(l=>l.freeCash>=0?'rgba(37,99,235,.68)':'rgba(244,63,94,.68)'),borderRadius:4,maxBarThickness:24,order:2},{type:'line',label:'Flujo acumulado',data:r.lines.map(l=>l.cumulative),borderColor:'#0d9488',backgroundColor:'#0d9488',borderWidth:2.6,pointRadius:r.lines.length>40?0:2.5,pointHoverRadius:5,tension:.25,order:1}]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{position:'bottom',labels:{boxWidth:12,usePointStyle:true,padding:18}},tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${money(c.parsed.y)}`}}},scales:{x:{grid:{display:false},ticks:{autoSkip:true,maxTicksLimit:11}},y:{ticks:{callback:v=>new Intl.NumberFormat('es-AR',{notation:'compact',maximumFractionDigits:1}).format(v)},grid:{color:'#edf2f7'}}}}})}
  function render(){hideHelp();const active=steps.some(s=>s.id===view)?view:(view==='results'?'results':'general');$('#side-steps').innerHTML=steps.map(s=>`<button class="side-link ${active===s.id?'active':''}" data-nav="${s.id}"><span class="step-num">${s.icon}</span><span class="leading-tight"><span class="block">${stepLabel(s.id)}</span><span class="text-[10px] opacity-65">${s.short}</span></span></button>`).join('');
    document.querySelectorAll('[data-nav="general"],[data-nav="results"]').forEach(b=>b.classList.toggle('active',b.dataset.nav===active&&b.classList.contains('side-link')));
    const index=steps.findIndex(s=>s.id===view);$('#progress-bar').style.width=((index+1)/steps.length*100)+'%';$('#top-section').textContent=view==='results'?'Panel de resultados':view==='general'?'Ficha del proyecto':'Asistente de carga · Paso '+(index+1);$('#top-project').textContent=model.meta.name||'Proyecto sin nombre';
    $('#main').innerHTML=view==='general'?pageGeneral():view==='results'?results():stepPage(view);
    if(view==='results')renderChart(compute());window.scrollTo({top:0,behavior:'instant'});
  }
  const defaults={selfUse:()=>({name:'Nuevo producto interno',quantity:0,referencePrice:0,start:1,volumeGrowth:0,referencePriceGrowth:0}),capex:()=>({name:'Nuevo activo',category:'Equipamiento',amount:0,life:10,economicLife:10,replace:'no',replacementGrowthAnnual:0,resalePct:0,at:0}),staff:()=>({name:'Nuevo puesto',qty:1,salary:0,start:1,endMode:'indefinido',end:12,salaryGrowthAnnual:0}),fixed:()=>({name:'Nuevo costo fijo',amount:0,start:1,supplierCredit:'no'}),variable:()=>({name:'Nuevo costo variable',driver:'units',amount:0,start:1,inventoryEligible:'no',supplierCredit:'no'}),products:()=>({name:'Nuevo producto',quantity:0,price:0,start:1,volumeGrowth:0,priceGrowth:0})};
  function updateInput(el){let obj,key=el.dataset.key;if(el.dataset.group){obj=model[el.dataset.group]?.[Number(el.dataset.index)]}else if(el.dataset.scope){obj=model[el.dataset.scope]}if(!obj||!(key in obj))return;let v=el.value;if(el.type==='number'){if(v===''||!Number.isFinite(Number(v)))return;v=Number(v);if(key==='periods')v=bound(Math.round(v),1,model.meta.frequency==='annual'?60:360);else if(['start','at','qty','life','end','economicLife','constructionMonths','rampMonths'].includes(key))v=Math.max(0,Math.round(v));else if(['daysReceivable','daysInventory','daysPayable'].includes(key))v=bound(Math.round(v),0,365);else if(el.dataset.scope==='scenario')v=bound(v,-99,1000);else if(['discountAnnual','inflationAnnual','volumeGrowth','priceGrowth','referencePriceGrowth','salaryGrowthAnnual','replacementGrowthAnnual'].includes(key))v=Math.max(-99,v);else if(key==='amount'&&el.dataset.group==='variable'&&obj.driver!=='units')v=bound(v,0,100);else v=Math.max(0,v)}if(['lossCarry','sacEnabled'].includes(key))v=v==='true';obj[key]=v;if(key==='frequency'&&v==='annual'&&model.meta.periods>60)model.meta.periods=60;save();if(view==='results'){/* Actualizar al confirmar el campo para no perder el foco al escribir. */}else{const sec=$('#section-summary');if(sec){const results=compute();if(view==='capex')sec.textContent=`CAPEX total incl. reposiciones: ${money(results.invest)}`;if(view==='revenue')sec.textContent=`Ventas: ${money(results.revenue)} | Compras evitadas: ${money(results.savings)}`}$('#top-project').textContent=model.meta.name||'Proyecto sin nombre'}}
  function navigate(to){if(!steps.some(s=>s.id===to)&&to!=='general'&&to!=='results')return;view=to;render()}
  document.addEventListener('input',e=>{const el=e.target;if(el.matches('input[data-scope],input[data-group]'))updateInput(el)});
  document.addEventListener('change',e=>{const el=e.target;if(el.matches('input[data-scope],input[data-group],select[data-scope],select[data-group]')){updateInput(el);render()}});
  document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
    if(b.classList.contains('help-trigger')){e.preventDefault();showHelp(b);return;}
    if(b.dataset.nav){navigate(b.dataset.nav);return}
    if(b.dataset.add){const group=b.dataset.add;if(defaults[group]){model[group].push(defaults[group]());save();render()}return}
    if(b.dataset.delete){const group=b.dataset.delete,i=Number(b.dataset.index);if(Array.isArray(model[group])){model[group].splice(i,1);save();render()}return}
    if(b.dataset.action==='export-json'){download('evalpro_'+(model.meta.name||'proyecto').replace(/[^\wáéíóúñ-]+/gi,'_')+'.json',JSON.stringify(model,null,2),'application/json');toast('Proyecto exportado en JSON');return}
    if(b.dataset.action==='import-json'){$('#file-import').click();return}
    if(b.dataset.action==='export-csv'){const res=compute(),header=['Periodo','Produccion','Ingresos','Compras evitadas','Beneficios economicos','Personal','SAC incluido','Fijos','Variables','EBITDA','Depreciacion','Impuestos','CAPEX','CAPEX reposicion','Venta usados','Cuentas por cobrar','Inventarios','Cuentas por pagar','Saldo capital trabajo','Variacion capital trabajo','Recuperacion capital trabajo','Residual','Flujo libre','Flujo descontado','Acumulado','Acum descontado'];const lines=[header.join(';'),...res.lines.map(r=>[r.t,r.units,r.revenue,r.savings,r.benefits,r.staff,r.bonus,r.fixed,r.variable,r.ebitda,r.depreciation,r.taxes,r.capex,r.replacementCapex,r.resale,r.receivables,r.inventory,r.payables,r.wcBalance,r.deltaWC,r.releaseWC,r.residual,r.freeCash,r.discount,r.cumulative,r.discountCum].map(v=>String(v).replace('.',',')).join(';'))];download('flujo_evalpro.csv','\ufeff'+lines.join('\r\n'),'text/csv;charset=utf-8');toast('Flujo exportado a CSV');return}
    if(b.dataset.action==='print'){window.print();return}
  });
  $('#file-import').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{const content=await file.text();model=hydrate(JSON.parse(content));save();navigate('general');toast('Proyecto recuperado correctamente')}catch(error){toast('No se pudo importar: '+error.message)}e.target.value=''});
  render();
})();
