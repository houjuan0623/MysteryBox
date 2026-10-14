import { MongoClient, MongoServerError, type ClientSession, type Collection, type Db } from "mongodb";
import { createHash } from "node:crypto";

export interface Records {
  get<T>(kind: string, key: string): Promise<T | undefined>;
  put<T>(kind: string, key: string, value: T): Promise<void>;
  insert<T>(kind: string, key: string, value: T): Promise<boolean>;
  delete(kind: string, key: string): Promise<void>;
  list<T>(kind: string): Promise<T[]>;
}
export interface Store extends Records {
  atomic<T>(lock: string, operation: (tx: Records) => Promise<T>): Promise<T>;
  ready(): Promise<void>;
  close(): Promise<void>;
  mode: "memory" | "mongo";
}
/** 演示仓储与 MongoDB 遵循同一接口；每个原子操作有隔离副本，异常会回滚。 */
export class MemoryStore implements Store {
  mode = "memory" as const;
  private values = new Map<string, unknown>();
  private tail: Promise<void> = Promise.resolve();
  async ready() {}
  async close() {}
  async get<T>(kind: string, key: string) {
    return structuredClone(this.values.get(`${kind}:${key}`)) as T | undefined;
  }
  async put<T>(kind: string, key: string, value: T) {
    this.values.set(`${kind}:${key}`, structuredClone(value));
  }
  async insert<T>(kind: string, key: string, value: T) {
    if (this.values.has(`${kind}:${key}`)) return false;
    await this.put(kind, key, value);
    return true;
  }
  async delete(kind: string, key: string) {
    this.values.delete(`${kind}:${key}`);
  }
  async list<T>(kind: string) {
    return [...this.values]
      .filter(([key]) => key.startsWith(`${kind}:`))
      .map(([, v]) => structuredClone(v) as T);
  }
  async atomic<T>(
    _lock: string,
    operation: (tx: Records) => Promise<T>,
  ): Promise<T> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((r) => {
      release = r;
    });
    await previous;
    const backup = structuredClone(this.values);
    try {
      return await operation(this);
    } catch (error) {
      this.values = backup;
      throw error;
    } finally {
      release();
    }
  }
}

/** MongoDB 聚合记录：复合唯一索引保护请求、capture、事件等不可重复业务键。 */
interface RecordDocument { _id: string; kind: string; key: string; payload: unknown; createdAt: Date; updatedAt: Date; }
interface GuardDocument { _id: string; version: number; }
const recordId = (kind:string,key:string) => createHash('sha256').update(JSON.stringify([kind,key])).digest('hex');
const delay = (ms:number) => new Promise<void>(resolve=>setTimeout(resolve,ms));
const label = (error:unknown,name:string) => error instanceof MongoServerError && error.hasErrorLabel(name);
class MongoRecords implements Records {
  protected records: Collection<RecordDocument>;
  constructor(db:Db,private session?:ClientSession) { this.records=db.collection<RecordDocument>('app_records'); }
  async get<T>(kind:string,key:string):Promise<T|undefined> { return (await this.records.findOne({kind,key},{session:this.session}))?.payload as T|undefined; }
  async put<T>(kind:string,key:string,value:T) {
    await this.records.updateOne({kind,key},{$set:{payload:value,updatedAt:new Date()},$setOnInsert:{_id:recordId(kind,key),createdAt:new Date()}},{upsert:true,session:this.session});
  }
  async insert<T>(kind:string,key:string,value:T):Promise<boolean> {
    if(await this.records.findOne({kind,key},{session:this.session,projection:{_id:1}})) return false;
    try { await this.records.insertOne({_id:recordId(kind,key),kind,key,payload:value,createdAt:new Date(),updatedAt:new Date()},{session:this.session});return true; }
    catch(error) {
      // 事务内冲突必须向上传播并回滚，不能吞掉已中止事务的 duplicate-key 错误。
      if(!this.session && error instanceof MongoServerError && error.code===11000) return false;
      throw error;
    }
  }
  async delete(kind:string,key:string) { await this.records.deleteOne({kind,key},{session:this.session}); }
  async list<T>(kind:string):Promise<T[]> { return (await this.records.find({kind},{session:this.session}).sort({createdAt:-1}).toArray()).map(row=>row.payload as T); }
}
/**
 * MongoDB 必须是副本集/Atlas，单节点 standalone 不支持本项目需要的多文档事务。
 * 每个业务键先更新独立 guard 文档，争用在运行领域回调前解决。
 * 不使用 withTransaction：其自动重跑回调可能重复调用模型/支付/邮件。
 * 一旦回调开始，故障只回滚并报告；提交结果不明确时只重试同一 commit。
 * 网络适配器有30秒上限；小型MVP保持事务简洁，未来应迁移任务租约/outbox架构。
 */
export class MongoStore extends MongoRecords implements Store {
  mode='mongo' as const;
  private guards:Collection<GuardDocument>;
  constructor(private client:MongoClient,private db:Db) {super(db);this.guards=db.collection<GuardDocument>('transaction_guards');}
  static fromUrl(url:string,dbName='mysterybox') {const client=new MongoClient(url,{maxPoolSize:10,serverSelectionTimeoutMS:5000});return new MongoStore(client,client.db(dbName));}
  async initialize() {
    await this.client.connect();
    await this.assertReplicaSet();
    await this.records.createIndex({kind:1,key:1},{unique:true,name:'kind_key_unique'});
    await this.records.createIndex({kind:1,createdAt:-1},{name:'kind_created_at'});
    await this.guards.updateOne({_id:'initialization'},{$setOnInsert:{version:0}},{upsert:true});
  }
  private async assertReplicaSet() {
    const hello=await this.db.admin().command({hello:1});
    if(!hello.setName && hello.msg!=='isdbgrid') throw new Error('MongoDB replica set is required');
  }
  async ready() {
    await this.client.connect();await this.assertReplicaSet();
    const indexes=await this.records.listIndexes().toArray();
    if(!indexes.some(i=>i.name==='kind_key_unique' && i.unique)) throw new Error('MongoDB indexes missing; run npm run db:init');
  }
  async close() {await this.client.close();}
  async atomic<T>(lock:string,operation:(tx:Records)=>Promise<T>):Promise<T> {
    try {await this.guards.updateOne({_id:lock},{$setOnInsert:{version:0}},{upsert:true,writeConcern:{w:'majority'}});}
    catch(error) {if(!(error instanceof MongoServerError && error.code===11000))throw error;}
    const deadline=Date.now()+45000;
    while(Date.now()<deadline) {
      const session=this.client.startSession();
      session.startTransaction({readConcern:{level:'snapshot'},writeConcern:{w:'majority'},maxCommitTimeMS:5000});
      try {
        try { await this.guards.updateOne({_id:lock},{$inc:{version:1}},{session}); }
        catch(error) {
          await session.abortTransaction();
          if(label(error,'TransientTransactionError')) {await delay(20+Math.floor(Math.random()*40));continue;}
          throw error;
        }
        const result=await operation(new MongoRecords(this.db,session));
        for(let attempt=0;;attempt++) {
          try {await session.commitTransaction();return result;}
          catch(error) {if(label(error,'UnknownTransactionCommitResult') && attempt<5){await delay(100);continue;}throw error;}
        }
      } catch(error) {
        if(session.inTransaction())await session.abortTransaction();
        throw error;
      } finally {await session.endSession();}
    }
    throw new Error('Business operation is busy; retry the same idempotency key');
  }
}
