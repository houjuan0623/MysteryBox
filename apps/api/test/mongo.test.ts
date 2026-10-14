import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {MongoMemoryReplSet} from 'mongodb-memory-server';
import {MongoStore} from '../src/store';
import {MysteryBoxService} from '../src/domain';
import {readConfig} from '../src/config';
import {createProviders} from '../src/providers';
import {catalog,CATALOG_VERSION} from '../src/catalog';
import {briefSchema} from '../../../packages/shared/src';
/** 真正的mongod副本集，不把内存仓储当作Mongo集成证据。测试库为随机名称。 */
test('MongoDB replica-set indexes, atomic contention, rollback and restart persistence',{skip:process.env.RUN_MONGO_TESTS!=='1'&&!process.env.TEST_MONGODB_URI,timeout:180000},async()=>{
 const repl=process.env.TEST_MONGODB_URI?undefined:await MongoMemoryReplSet.create({binary:{version:'8.0.17',downloadDir:'/workspace/shared/mongodb-binaries'},instanceOpts:[{args:['--nounixsocket']}],replSet:{count:1,storageEngine:'wiredTiger'}});
 const uri=process.env.TEST_MONGODB_URI||repl!.getUri();const db=`mysterybox_test_${randomUUID().replaceAll('-','')}`;
 const a=MongoStore.fromUrl(uri,db),b=MongoStore.fromUrl(uri,db);
 try {
  await a.initialize();await b.ready();
  assert.equal(await a.insert('unique','a',{x:1}),true);assert.equal(await b.insert('unique','a',{x:2}),false);
  await a.put('counter','one',{n:0});
  await Promise.all(Array.from({length:20},(_,i)=>(i%2?a:b).atomic('counter:one',async tx=>{const row=(await tx.get<{n:number}>('counter','one'))!;await tx.put('counter','one',{n:row.n+1});})));
  assert.equal((await a.get<{n:number}>('counter','one'))?.n,20);
  await assert.rejects(a.atomic('rollback',async tx=>{await tx.put('rollback','x',{x:1});throw Error('rollback');}));assert.equal(await b.get('rollback','x'),undefined);
  const c=readConfig({}),providers=createProviders(c);const one=new MysteryBoxService(c,a,providers),two=new MysteryBoxService(c,b,providers);
  await assert.rejects(one.loadCatalog());
  for(const tool of catalog)await a.put('tools',tool.id,tool);await a.put('catalog_versions','current',{version:CATALOG_VERSION});await one.loadCatalog();assert.equal(one.catalog.length,16);
  let captures=0;const capture=providers.payments.capture.bind(providers.payments);providers.payments.capture=async input=>{captures++;return capture(input);};
  const order=await one.createOrder(briefSchema.parse({interest:'business'}),randomUUID());
  const results=await Promise.all([one.captureOrder(order.orderId,order.accessToken,undefined,true),two.captureOrder(order.orderId,order.accessToken,undefined,true)]);assert.equal(captures,1);assert.equal(results[0]!.box.id,results[1]!.box.id);
  await b.close();const reopened=MongoStore.fromUrl(uri,db);try{await reopened.ready();const after=new MysteryBoxService(c,reopened,providers);assert.equal((await after.readBox(results[0]!.box.id,results[0]!.accessToken)).id,results[0]!.box.id);}finally{await reopened.close();}
 }finally{await a.close();await b.close();await repl?.stop();}
});
