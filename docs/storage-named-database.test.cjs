const { PGlite } = require('../.npm-cache/storage-tests/node_modules/@electric-sql/pglite');
const fs = require('fs');
const assert = require('assert/strict');
(async () => {
  const db = new PGlite();
  try {
    const a = '10000000-0000-0000-0000-000000000001', b = '10000000-0000-0000-0000-000000000002';
    await db.exec(`
      create role authenticated;
      create table companies(id uuid primary key);
      create table products(id uuid primary key,company_id uuid);
      insert into companies values ('${a}'), ('${b}');
      grant select on products to authenticated;
      create function is_owner() returns boolean language sql stable as $$ select false $$;
      create function has_company_access(company_id uuid) returns boolean language sql stable as $$ select company_id::text = current_setting('test.company',true) $$;
    `);
    await db.exec(fs.readFileSync('supabase/storage-layouts.sql','utf8').replace(/^\ufeff/,''));
    const migration = fs.readFileSync('supabase/storage-named-layouts.sql','utf8');
    await db.exec(migration);
    await db.exec(migration);
    await db.exec('set role authenticated');
    await db.query("select set_config('test.company',$1,false)", [a]);
    const layout = {version:1,objects:[],items:[],area:{width:12,depth:8}};
    const insert = async (company,name,value=layout) => db.query('insert into storage_named_layouts(company_id,name,layout) values($1,$2,$3) returning id',[company,name,JSON.stringify(value)]);
    const id = (await insert(a,'Principal')).rows[0].id;
    await insert(a,'Alternativo');
    await assert.rejects(insert(a,'principal'), /unique/);
    await assert.rejects(insert(b,'Proibido'), /row-level security/);
    await assert.rejects(insert(a,'Inválido',{version:2,objects:[],items:[]}), /inválido/);
    await db.query('update storage_named_layouts set revision=2 where id=$1',[id]);
    await assert.rejects(db.query('update storage_named_layouts set revision=2 where id=$1',[id]), /desatualizada/);
    assert.equal((await db.query('select * from storage_named_layouts')).rows.length,2);
    await db.query("select set_config('test.company',$1,false)",[b]);
    assert.equal((await db.query('select * from storage_named_layouts')).rows.length,0);
    console.log('Named layouts: migration repeatability, names, company isolation and revision checks passed.');
  } finally { await db.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
