const {
  PGlite
} = require("../.npm-cache/storage-tests/node_modules/@electric-sql/pglite");
const fs = require("fs");
const assert = require("assert/strict");
(async () => {
  const db = new PGlite();
  const a = "10000000-0000-0000-0000-000000000001",
    b = "10000000-0000-0000-0000-000000000002";
  const pa = "20000000-0000-0000-0000-000000000001",
    pb = "20000000-0000-0000-0000-000000000002";
  await db.exec(`
    create role authenticated;
    create table public.companies(id uuid primary key);
    create table public.products(id uuid primary key,company_id uuid references public.companies(id));
    insert into public.companies values ('${a}'),('${b}');
    insert into public.products values ('${pa}','${a}'),('${pb}','${b}');
    grant select on public.products to authenticated;
    create function public.is_owner() returns boolean language sql stable as $$ select coalesce(current_setting('test.profile',true)='owner',false) $$;
    create function public.has_company_access(company_id uuid) returns boolean language sql stable as $$ select coalesce(company_id::text=current_setting('test.company',true),false) $$;
  `);
  await db.exec(
    fs
      .readFileSync("supabase/storage-layouts.sql", "utf8")
      .replace(/^\ufeff/, "")
  );
  await db.exec(
    fs
      .readFileSync("supabase/storage-layouts.sql", "utf8")
      .replace(/^\ufeff/, "")
  );
  await db.exec("set role authenticated");
  await db.query(
    "select set_config('test.profile','employee',false),set_config('test.company',$1,false)",
    [a]
  );
  const object = {
    id: "slot-a",
    name: "Posição A",
    code: "A01",
    type: "slot",
    parentId: null,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    dimensions: { width: 1, height: 1, depth: 1 }
  };
  const layout = {
    version: 1,
    objects: [object],
    items: [{ id: "item-a", productId: pa, locationId: "slot-a", quantity: 10 }]
  };
  await db.query(
    "insert into public.storage_layouts(company_id,layout) values($1,$2)",
    [a, JSON.stringify(layout)]
  );
  assert.equal(
    (await db.query("select * from public.storage_layouts")).rows.length,
    1
  );
  await assert.rejects(
    db.query("insert into public.storage_layouts(company_id) values($1)", [b]),
    /row-level security/
  );
  await db.query("select set_config('test.company',$1,false)", [b]);
  assert.equal(
    (await db.query("select * from public.storage_layouts")).rows.length,
    0
  );
  await db.query(
    "select set_config('test.company',$1,false),set_config('test.profile','manager',false)",
    [a]
  );
  await db.query(
    "update public.storage_layouts set revision=2 where company_id=$1",
    [a]
  );
  await assert.rejects(
    db.query(
      "update public.storage_layouts set revision=2 where company_id=$1",
      [a]
    ),
    /desatualizada/
  );
  const wrong = { ...layout, items: [{ ...layout.items[0], productId: pb }] };
  await assert.rejects(
    db.query(
      "update public.storage_layouts set layout=$1,revision=3 where company_id=$2",
      [JSON.stringify(wrong), a]
    ),
    /indisponível nesta empresa/
  );
  await db.query(
    "select set_config('test.profile','owner',false),set_config('test.company',$1,false)",
    [b]
  );
  assert.equal(
    (await db.query("select * from public.storage_layouts")).rows.length,
    1
  );
  await db.query("insert into public.storage_layouts(company_id) values($1)", [
    b
  ]);
  assert.equal(
    (await db.query("select * from public.storage_layouts")).rows.length,
    2
  );
  const invalid = {
    ...layout,
    objects: [{ ...object, dimensions: { width: -1, height: 1, depth: 1 } }]
  };
  await assert.rejects(
    db.query(
      "update public.storage_layouts set layout=$1,revision=3 where company_id=$2",
      [JSON.stringify(invalid), a]
    ),
    /Dimensões inválidas/
  );
  console.log(
    "PostgreSQL local: migração repetível, RLS dos três perfis, isolamento entre empresas, revisão e validações de produtos/dimensões OK"
  );
  await db.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
