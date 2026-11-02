import { createServer } from 'node:http';
import handler from './handler';
createServer((req,res)=>void handler(req,res)).listen(4174,'127.0.0.1',()=>console.log('QORGAU API: http://127.0.0.1:4174'));
