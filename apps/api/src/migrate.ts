import { readConfig } from './config';
import { MongoStore } from './store';
/** 幂等创建MongoDB集合索引，不执行删除/清表，不写入演示用户。 */
async function main() {
 const c=readConfig();if(!c.mongoUrl)throw new Error('MONGODB_URI is required');
 const store=MongoStore.fromUrl(c.mongoUrl,c.mongoDb);
 try {await store.initialize();console.log('MongoDB collections and unique indexes ready.');}
 finally {await store.close();}
}
main().catch(()=>{console.error('MongoDB initialization failed; check URI and replica set.');process.exitCode=1;});
