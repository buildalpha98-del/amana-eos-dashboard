const fs = require('fs');
const path = require('path');
const http = require('http');
const { randomUUID, randomBytes } = require('crypto');
const root = process.cwd();
const { createRequire } = require('module');
const req = createRequire(path.join(root, 'package.json'));
const esbuild = req('esbuild');
const { chromium } = req('@playwright/test');
const { NextRequest } = req('next/server');
const { encode } = req('next-auth/jwt');
const { hash } = req('bcryptjs');
const output = '/tmp/amana-security-browser';
fs.mkdirSync(output, { recursive: true });
process.env.NEXTAUTH_SECRET = randomBytes(32).toString('hex');
process.env.NEXTAUTH_URL = 'http://localhost:4199';
process.env.PASSKEY_ORIGIN = process.env.NEXTAUTH_URL;
const password = randomBytes(24).toString('hex');
(async () => {
  const user = { id: 'synthetic-owner', name: 'Synthetic owner', email: 'synthetic@example.test', role: 'owner', active: true, isCentreAccount: false, tokenVersion: 3, mfaEnabledAt: null, passwordHash: await hash(password, 4) };
  const keys = new Map(), challenges = new Map();
  const audits = [];
  const db = {
    user: { findUnique: async () => user },
    passkey: {
      findMany: async ({select}={}) => select ? [...keys.values()].map(k=>({id:k.id,createdAt:new Date(),lastUsedAt:null})) : [...keys.values()], count: async () => keys.size,
      findFirst: async ({where}) => { const key=keys.get(where.id); return key?.userId===where.userId?key:null; },
      create: async ({data}) => { keys.set(data.id,data); return data; },
      updateMany: async ({where,data}) => { const key=keys.get(where.id); if (!key||key.counter!==where.counter) return {count:0}; Object.assign(key,data); return {count:1}; },
    },
    passkeyChallenge: {
      create: async ({data}) => {const row={id:randomUUID(),...data};challenges.set(row.id,row);return row;},
      findUnique: async ({where}) => challenges.get(where.id),
      deleteMany: async ({where}) => { let count=0;for (const [id,c] of challenges) {if(where.id&&id!==where.id)continue;if(where.binding&&c.binding!==where.binding)continue;if(where.expiresAt?.gt&&c.expiresAt<=where.expiresAt.gt)continue;if(where.expiresAt?.lt&&c.expiresAt>=where.expiresAt.lt)continue;challenges.delete(id);count++;}return {count}; },
    },
    activityLog: {create: async ({data}) => {audits.push(data);return data;}},
    $queryRaw: async () => [],
    $transaction: async fn => fn(db),
  };
  globalThis.__securityTestDb = db;
  await esbuild.build({stdin:{contents:'export * from "./src/lib/passkeys"; export * from "./src/lib/recent-auth";',resolveDir:root,loader:'ts'},bundle:true,platform:'node',format:'cjs',packages:'external',outfile:output+'/backend.cjs',tsconfig:root+'/tsconfig.json',plugins:[{name:'synthetic-db',setup(b){b.onResolve({filter:/^@\/lib\/prisma$/},()=>({path:'db',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const prisma = globalThis.__securityTestDb;',loader:'js'}));}}]});
  const backend = require(output+'/backend.cjs');
  const entry = `import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';import{useBankReveal}from'./src/components/security/BankRevealDialog';import{PrivateTranscriptForm}from'./src/components/meetings/PrivateTranscriptForm';function App(){const b=useBankReveal('synthetic');return <main className="mx-auto max-w-3xl space-y-6 p-5 text-foreground"><h1 className="text-xl font-heading">Security review — synthetic records</h1><button className="min-h-11 rounded-lg bg-brand px-4 text-white" onClick={b.reveal}>View bank details</button>{b.dialog}{b.revealed&&<p role="status">Bank details confirmed</p>}<PrivateTranscriptForm meetingId="synthetic-meeting"/></main>}createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient()}><App/></QueryClientProvider>);`;
  await esbuild.build({stdin:{contents:entry,resolveDir:root,loader:'tsx'},bundle:true,platform:'browser',format:'iife',jsx:'automatic',outfile:output+'/client.js',tsconfig:root+'/tsconfig.json',define:{'process.env.NODE_ENV':'"development"'}});
  const postcss = req('postcss'), tailwind=req('@tailwindcss/postcss');
  const css=await postcss([tailwind({base:root})]).process(fs.readFileSync(root+'/src/app/globals.css','utf8'),{from:root+'/src/app/globals.css'});
  fs.writeFileSync(output+'/styles.css',css.css);
  const session={user:{id:user.id,name:user.name,role:'owner'},expires:'2099'};
  const server=http.createServer(async (request,res)=>{
    try {
      if(request.url==='/client.js'||request.url==='/styles.css'){res.setHeader('content-type',request.url.endsWith('.js')?'text/javascript':'text/css');return res.end(fs.readFileSync(output+request.url));}
      if(!request.url.startsWith('/api/')){res.setHeader('content-type','text/html');return res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><script src="/client.js"></script></body></html>');}
      let raw='';for await(const c of request)raw+=c;
      const body=raw?JSON.parse(raw):{};
      const nr=new NextRequest('http://localhost:4199'+request.url,{method:request.method,headers:request.headers});
      let result;
      if(request.url==='/api/auth/passkeys'&&request.method==='GET')result=await backend.listPasskeys(nr,session);
      else if(request.url==='/api/auth/confirm-identity'){
        const proof=await backend.confirmIdentity(nr,session,body);res.setHeader('Set-Cookie',`amana-recent-auth=${proof}; HttpOnly; SameSite=Strict; Path=/api`);result={ok:true};
      }else if(request.url==='/api/auth/passkeys'&&body.action==='begin')result=await backend.beginPasskey(nr,session,body.operation,body.purpose);
      else if(request.url==='/api/auth/passkeys'&&body.action==='finish'){
        const proof=await backend.finishPasskey(nr,session,body.challengeId,body.response);res.setHeader('Set-Cookie',`amana-recent-auth=${proof}; HttpOnly; SameSite=Strict; Path=/api`);result={ok:true};
      }else if(request.url==='/api/enrolments/synthetic/payment'){
        await backend.assertRecentAuth(nr,session,'payment_reveal');result={method:'bank_account',accountName:'Synthetic family',bsb:'000000',accountNumber:'00000000'};
      }else if(request.url==='/api/meetings/synthetic-meeting/transcripts')result={id:'synthetic-transcript'};
      else {res.statusCode=404;result={error:'Unknown fixture route'};}
      res.setHeader('content-type','application/json');res.end(JSON.stringify(result));
    } catch(e){res.statusCode=e.status||500;res.setHeader('content-type','application/json');res.end(JSON.stringify({error:e.message,details:e.details}));}
  });
  await new Promise(r=>server.listen(4199,'127.0.0.1',r));
  let browser;
  try {
    browser=await chromium.launch({channel:'chrome',headless:true});
    const context=await browser.newContext({viewport:{width:375,height:812}});
    const token=await encode({token:{sub:user.id,loginAt:100,tokenVersion:3},secret:process.env.NEXTAUTH_SECRET});
    await context.addCookies([{name:'next-auth.session-token',value:token,domain:'localhost',path:'/',httpOnly:true}]);
    const page=await context.newPage();const cdp=await context.newCDPSession(page);
    await cdp.send('WebAuthn.enable');await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}});
    await page.goto('http://localhost:4199');
    await page.getByRole('button',{name:'View bank details'}).click();
    await page.getByLabel('Password',{exact:true}).fill(password);
    await page.screenshot({path:output+'/passkey-setup-phone.png'});
    await page.getByRole('button',{name:'Confirm and continue'}).click();
    await page.getByRole('button',{name:'Create passkey'}).click();
    await page.getByRole('status').waitFor();
    if(keys.size!==1||!audits.some(a=>a.action==='passkey_registered'))throw new Error('Registration not persisted/audited');
    // Clear only the recent proof; preserve the signed-in session and passkey.
    await context.clearCookies({name:'amana-recent-auth'});
    await page.reload();await page.setViewportSize({width:1440,height:1000});
    await page.getByRole('button',{name:'View bank details'}).click();
    await page.getByRole('button',{name:'Confirm with passkey'}).waitFor();
    await page.screenshot({path:output+'/passkey-confirm-desktop.png'});
    await page.getByRole('button',{name:'Confirm with passkey'}).click();await page.getByRole('status').waitFor();
    if(!audits.some(a=>a.action==='passkey_confirmed'))throw new Error('Authentication not audited');
    await page.setViewportSize({width:375,height:812});
    await page.getByLabel('Written notes or transcript').fill('Synthetic meeting notes. No real family information.');
    await page.getByRole('button',{name:'Save privately'}).click();
    await page.screenshot({path:output+'/private-notes-phone.png'});
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
    if(overflow)throw new Error('Phone layout overflows');
    console.log(JSON.stringify({result:'passed',realWebAuthnRegistration:true,realWebAuthnAuthentication:true,serverCode:'actual passkeys and recent-auth libraries',database:'synthetic in-memory adapter',viewports:[375,1440],screenshots:3}));
  }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
