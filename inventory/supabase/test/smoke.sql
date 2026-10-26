-- Smoke test: run after stub.sql + schema.sql + grants.sql. Expected errors are
-- the permission / validation checks firing (read the comments).
\set ON_ERROR_STOP 0
insert into auth.users (id,email,raw_user_meta_data) values ('00000000-0000-0000-0000-000000000001','admin@x.com','{"full_name":"Admin A","phone":"98765 43210"}');
insert into auth.users (id,email,raw_user_meta_data) values ('00000000-0000-0000-0000-000000000002','staff@x.com','{"full_name":"Staff S","phone":"9000000002"}');
-- duplicate phone must fail
insert into auth.users (email,raw_user_meta_data) values ('dup@x.com','{"full_name":"Dup","phone":"+919000000002"}');
select full_name, phone, role_key, status from profiles order by created_at;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select 'pending staff sees products', count(*) from products;
select import_purchase('{"supplier":{"name":"X"},"invoice_no":"1","items":[{"sku":"A1","name":"a","qty":1,"unit_price":1}]}');
-- staff tries to make self admin
update profiles set role_key='admin', status='active' where id = auth.uid();

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
update profiles set role_key='staff', status='active' where email='staff@x.com';
insert into invitations (email, role_key) values ('viewer@x.com','viewer');
select import_purchase('{"supplier":{"name":"EBC EMPIRE BIZCORP PVT LTD"},"invoice_no":"INV145","invoice_date":"2026-10-22","subtotal":100,"items":[
  {"sku":"EMPP000001","name":"AYUR TEA TABLET - 60TAB","pack":"60TAB","qty":5,"unit_price":660,"gst_amount":64.71,"taxable_amount":3235.29,"gst_rate":2},
  {"sku":"EMPP000002","name":"FEVER SYRUP - 200ML","qty":5,"unit_price":260,"gst_amount":25.49,"taxable_amount":1274.51,"gst_rate":2}]}') as pur \gset
-- duplicate import must fail
select import_purchase('{"supplier":{"name":"ebc empire bizcorp pvt ltd"},"invoice_no":"inv145","items":[{"sku":"EMPP000001","name":"x","qty":1,"unit_price":1}]}');
select sku, name, on_hand, stock_value, low_stock from product_stock order by sku;

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select record_movements('sale', (select jsonb_agg(jsonb_build_object('product_id', id, 'qty', 2, 'unit_price', 700)) from products where sku='EMPP000001'), 'Bill 1', null);
select record_movements('sale', (select jsonb_agg(jsonb_build_object('product_id', id, 'qty', 10)) from products where sku='EMPP000001'), 'Bill 2', null);
select record_movements('damage', (select jsonb_agg(jsonb_build_object('product_id', id, 'qty', 1)) from products where sku='EMPP000001'), null, 'broken');
update products set sell_price = 1;
insert into stock_movements (product_id, qty, kind) select id, 100, 'opening' from products limit 1;
select count(*) as staff_audit_rows from audit_log;
select count(*) as staff_purchases from purchases;

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select apply_stock_count((select jsonb_agg(jsonb_build_object('product_id', id, 'counted', 1)) from products where sku='EMPP000001'), 'Monthly count');
update products set sell_price = 750, reorder_level = 2 where sku='EMPP000001';
select reverse_movement((select max(id) from stock_movements where kind='sale'), 'wrong bill');
select reverse_movement((select max(id) from stock_movements where kind='reversal'), 'again');
select kind, qty, reference, note, created_by_name from movement_feed order by id;
select void_purchase(:'pur', 'wrong invoice');
select sku, on_hand, low_stock from product_stock order by sku;
-- re-import after void allowed
select import_purchase('{"supplier":{"name":"EBC EMPIRE BIZCORP PVT LTD"},"invoice_no":"INV145","items":[{"sku":"EMPP000001","name":"x","qty":1,"unit_price":1}]}') is not null as reimport_ok;
select table_name, action, changed_fields, actor_name from audit_log order by id;
-- last admin cannot demote self
update profiles set role_key='staff' where id = auth.uid();
delete from role_permissions where role_key='viewer';
reset role;
insert into auth.users (email,raw_user_meta_data) values ('viewer@x.com','{"full_name":"V","phone":"9111111111"}');
select email, role_key, status from profiles order by created_at;
