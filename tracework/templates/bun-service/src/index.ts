import handler from './generated/handler';
Bun.serve({hostname:'127.0.0.1',port:Number(process.env.PORT||3000),fetch:handler});
