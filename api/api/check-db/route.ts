import { NextResponse } from 'next/server';
import client from '@/lib/mongodb'; // Đảm bảo file lib/mongodb.ts đã có theo mẫu trước

export async function GET() {
  try {
    await client.connect();
    const db = client.db('tên_database_của_bạn'); // Thay bằng tên DB thật trong canteen-go
    const collections = await db.listCollections().toArray();
    
    return NextResponse.json({ 
      status: 'success', 
      message: 'Kết nối MongoDB thành công!',
      collections: collections.map(c => c.name)
    });
  } catch (error) {
    return NextResponse.json({ 
      status: 'error', 
      message: error.message 
    }, { status: 500 });
  }
}