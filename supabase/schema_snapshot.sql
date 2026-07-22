--
-- PostgreSQL database dump
--

\restrict NwE6g12cmFAf077KvIXnrcvczeUiDiv3UX2NsgISr02aRLSq38gOcum9bW0DyCf

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: add_picking_material(uuid, uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.add_picking_material(p_picking_list_id uuid, p_product_id uuid, p_qty integer) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_company uuid := 'd2e5e565-5f67-4954-b8d9-5979a2a0c697';
        v_wh uuid; v_status text; v_no text; v_uid uuid := auth.uid();
        v_pname text; v_sku text; v_mid uuid;
BEGIN
  IF p_product_id IS NULL THEN RAISE EXCEPTION 'product_id wajib'; END IF;
  IF COALESCE(p_qty,0) <= 0 THEN RAISE EXCEPTION 'qty harus > 0'; END IF;
  SELECT status, warehouse_id, picking_no INTO v_status, v_wh, v_no FROM picking_lists WHERE id=p_picking_list_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Picking tidak ditemukan'; END IF;
  IF v_status <> 'done' THEN RAISE EXCEPTION 'Material hanya bisa dicatat saat picking selesai (status=%)', v_status; END IF;
  IF EXISTS (SELECT 1 FROM delivery_notes WHERE picking_list_id=p_picking_list_id AND status <> 'cancelled') THEN
    RAISE EXCEPTION 'Surat jalan sudah dibuat — material tak bisa ditambah lagi'; END IF;
  v_wh := COALESCE(v_wh, '303c3d4c-570e-40a1-b738-6b0ed1cb5078');
  SELECT name, code INTO v_pname, v_sku FROM products WHERE id=p_product_id;
  IF v_pname IS NULL THEN RAISE EXCEPTION 'Produk tidak ditemukan'; END IF;

  INSERT INTO picking_list_materials (picking_list_id, product_id, product_name, sku, qty, created_by)
  VALUES (p_picking_list_id, p_product_id, v_pname, COALESCE(v_sku,''), p_qty, v_uid)
  RETURNING id INTO v_mid;

  INSERT INTO stock_ledger
    (company_id, warehouse_id, product_id, movement_type, qty, reference_type, reference_id, reference_no, created_by)
  VALUES (v_company, v_wh, p_product_id, 'outbound', -abs(p_qty), 'picking_material', v_mid, v_no, v_uid);

  RETURN v_mid;
END; $$;


--
-- Name: attach_price_contract_info(uuid, text, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.attach_price_contract_info(p_history_id uuid, p_contract_no text, p_valid_from date, p_valid_until date) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE public.product_price_history
     SET contract_no = p_contract_no,
         valid_from  = p_valid_from,
         valid_until = p_valid_until
   WHERE id = p_history_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Baris riwayat harga % tidak ditemukan', p_history_id;
  END IF;
END;
$$;


--
-- Name: bulk_update_product_prices(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bulk_update_product_prices(p_rows jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_row jsonb; v_product_id uuid; v_new_price numeric; v_category text;
  v_contract text; v_valid_until date; v_current numeric; v_company uuid; v_history_id uuid;
  v_updated int := 0; v_skipped int := 0; v_results jsonb := '[]'::jsonb;
begin
  if not is_super_admin() then
    raise exception 'Tidak diizinkan: hanya super_admin yang boleh bulk update harga';
  end if;
  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    v_product_id  := (v_row->>'product_id')::uuid;
    v_new_price   := (v_row->>'new_price')::numeric;
    v_category    := coalesce(nullif(v_row->>'category',''), 'default');
    v_contract    := nullif(v_row->>'contract_no', '');
    v_valid_until := nullif(v_row->>'valid_until', '')::date;
    if v_product_id is null or v_new_price is null or v_new_price < 0 then
      raise exception 'Baris tidak valid (product_id/new_price kosong atau negatif): %', v_row;
    end if;
    if v_category not in ('default','semester','tahunan','project') then
      raise exception 'Kategori harga tidak valid: %', v_category;
    end if;
    select company_id,
           case v_category
             when 'semester' then price_semester
             when 'tahunan'  then price_tahunan
             when 'project'  then price_project
             else default_price
           end
      into v_company, v_current
      from products where id = v_product_id;
    if not found then
      raise exception 'Produk tidak ditemukan: %', v_product_id;
    end if;
    if v_current is distinct from v_new_price then
      if v_category = 'default' then
        update products set default_price = v_new_price where id = v_product_id;
        if v_contract is not null then
          select id into v_history_id from product_price_history
            where product_id = v_product_id order by changed_at desc limit 1;
          perform attach_price_contract_info(v_history_id, v_contract, current_date, v_valid_until);
        end if;
      else
        if v_category = 'semester' then
          update products set price_semester = v_new_price where id = v_product_id;
        elsif v_category = 'tahunan' then
          update products set price_tahunan = v_new_price where id = v_product_id;
        else
          update products set price_project = v_new_price where id = v_product_id;
        end if;
        insert into product_price_history
          (product_id, company_id, old_price, new_price, changed_by, source, price_category, contract_no, valid_from, valid_until)
        values
          (v_product_id, v_company, v_current, v_new_price, auth.uid(), 'bulk_category', v_category, v_contract, current_date, v_valid_until);
      end if;
      v_updated := v_updated + 1;
      v_results := v_results || jsonb_build_object(
        'product_id', v_product_id, 'category', v_category, 'status', 'updated',
        'old_price', v_current, 'new_price', v_new_price);
    else
      v_skipped := v_skipped + 1;
      v_results := v_results || jsonb_build_object(
        'product_id', v_product_id, 'category', v_category, 'status', 'skipped_same_price');
    end if;
  end loop;
  return jsonb_build_object('updated', v_updated, 'skipped', v_skipped, 'rows', v_results);
end;
$$;


--
-- Name: cancel_delivery(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_delivery(p_delivery_note_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_status text; v_uid uuid := auth.uid(); v_cust uuid; v_sp text;
BEGIN
  SELECT status, customer_id, sp_no INTO v_status, v_cust, v_sp FROM delivery_notes WHERE id=p_delivery_note_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Surat jalan tidak ditemukan'; END IF;
  IF v_status='cancelled' THEN RAISE EXCEPTION 'Surat jalan sudah dibatalkan'; END IF;
  IF v_status IN ('in_transit','delivered') THEN
    INSERT INTO stock_ledger
      (company_id, warehouse_id, product_id, movement_type, qty, reference_type, reference_id, reference_no, created_by)
    SELECT company_id, warehouse_id, product_id, 'inbound', abs(qty), 'delivery_cancel', reference_id, reference_no, v_uid
    FROM stock_ledger
    WHERE reference_type='delivery' AND reference_id=p_delivery_note_id AND movement_type='outbound';

    WITH agg AS (
      SELECT pli.sp_item_id AS sp_item_id, SUM(dni.qty) AS qty
      FROM delivery_note_items dni
      JOIN picking_list_items pli ON pli.id = dni.picking_list_item_id
      WHERE dni.delivery_note_id = p_delivery_note_id AND COALESCE(dni.qty,0) > 0 AND pli.sp_item_id IS NOT NULL
      GROUP BY pli.sp_item_id
    )
    UPDATE sp_items si SET shipped_qty = GREATEST(si.shipped_qty - agg.qty, 0), updated_at = now()
    FROM agg WHERE si.id = agg.sp_item_id;
  END IF;

  UPDATE delivery_notes SET status='cancelled', cancelled_at=now() WHERE id=p_delivery_note_id;

  IF v_cust IS NOT NULL AND v_sp IS NOT NULL THEN
    PERFORM sp_recompute_status(v_cust, v_sp);
  END IF;
END; $$;


--
-- Name: cancel_picking(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_picking(p_picking_list_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_status text; v_uid uuid := auth.uid(); v_cust uuid; v_sp text;
BEGIN
  SELECT status, customer_id, sp_no INTO v_status, v_cust, v_sp FROM picking_lists WHERE id=p_picking_list_id;
  IF v_sp IS NULL THEN RAISE EXCEPTION 'Picking tidak ditemukan'; END IF;
  IF v_status NOT IN ('pending','in_progress') THEN
    RAISE EXCEPTION 'Hanya picking pending/in_progress yang bisa dibatalkan (status=%)', v_status; END IF;
  INSERT INTO stock_ledger
    (company_id, warehouse_id, product_id, movement_type, qty, reference_type, reference_id, reference_no, created_by)
  SELECT company_id, warehouse_id, product_id, 'unreserved', qty, 'picking', reference_id, reference_no, v_uid
  FROM stock_ledger
  WHERE reference_type='picking' AND reference_id=p_picking_list_id AND movement_type='reserved';
  UPDATE picking_lists SET status='cancelled', cancelled_at=now() WHERE id=p_picking_list_id;
  UPDATE public.sp_orders SET had_cancelled_picking=true, updated_at=now()
    WHERE customer_id=v_cust AND sp_no=v_sp;
  PERFORM sp_recompute_status(v_cust, v_sp);
END; $$;


--
-- Name: capture_login_session(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.capture_login_session() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  BEGIN
    INSERT INTO public.user_login_logs (user_id, session_id, logged_in_at, ip, user_agent)
    VALUES (NEW.user_id, NEW.id, COALESCE(NEW.created_at, now()), host(NEW.ip), NEW.user_agent);
  EXCEPTION WHEN OTHERS THEN
    NULL;  -- kalau logging gagal, login TETEP jalan
  END;
  RETURN NEW;
END;
$$;


--
-- Name: complete_picking(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.complete_picking(p_picking_list_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_status text; v_cust uuid; v_sp text;
BEGIN
  SELECT status, customer_id, sp_no INTO v_status, v_cust, v_sp FROM picking_lists WHERE id=p_picking_list_id;
  IF v_sp IS NULL THEN RAISE EXCEPTION 'Picking tidak ditemukan'; END IF;
  IF v_status NOT IN ('pending','in_progress') THEN
    RAISE EXCEPTION 'Hanya picking pending/in_progress yang bisa diselesaikan (status=%)', v_status; END IF;
  UPDATE picking_lists SET status='done', completed_at=now(), updated_at=now() WHERE id=p_picking_list_id;
  PERFORM sp_recompute_status(v_cust, v_sp);
END; $$;


--
-- Name: create_sp_order_dual(uuid, uuid, text, date, uuid, text, date, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_sp_order_dual(p_company_id uuid, p_customer_id uuid, p_sp_no text, p_sp_date date, p_dc_id uuid, p_status text, p_expired_date date, p_notes text, p_items jsonb) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_order_id uuid;
BEGIN
  INSERT INTO public.sp_orders
    (company_id, customer_id, sp_no, sp_date, dc_id, status, expired_date, notes, created_by)
  VALUES
    (p_company_id, p_customer_id, p_sp_no, p_sp_date, p_dc_id,
     COALESCE(NULLIF(p_status,''),'DRAFT'), p_expired_date, p_notes, auth.uid())
  RETURNING id INTO v_order_id;

  INSERT INTO public.sp_order_items
    (sp_order_id, company_id, product_id, product_name, sku, qty, shipped_qty,
     unit_price, price_category, shipping_price, legacy_sp_item_id)
  SELECT
    v_order_id, p_company_id,
    (e->>'product_id')::uuid,
    COALESCE(e->>'product_name',''),
    COALESCE(e->>'sku',''),
    (e->>'qty')::int,
    0,
    COALESCE((e->>'unit_price')::numeric, 0),
    NULLIF(e->>'price_category',''),
    COALESCE((e->>'shipping_price')::numeric, 0),
    NULLIF(e->>'legacy_sp_item_id','')::uuid
  FROM jsonb_array_elements(p_items) AS e;

  RETURN v_order_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'SP % sudah ada untuk customer ini (duplikat)', p_sp_no
      USING ERRCODE = 'unique_violation';
END;
$$;


--
-- Name: delete_picking_material(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_picking_material(p_material_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_pick uuid; v_uid uuid := auth.uid();
BEGIN
  SELECT picking_list_id INTO v_pick FROM picking_list_materials WHERE id=p_material_id;
  IF v_pick IS NULL THEN RAISE EXCEPTION 'Material tidak ditemukan'; END IF;
  IF EXISTS (SELECT 1 FROM delivery_notes WHERE picking_list_id=v_pick AND status <> 'cancelled') THEN
    RAISE EXCEPTION 'Tak bisa hapus material: surat jalan sudah dibuat'; END IF;
  INSERT INTO stock_ledger
    (company_id, warehouse_id, product_id, movement_type, qty, reference_type, reference_id, reference_no, created_by)
  SELECT company_id, warehouse_id, product_id, 'inbound', abs(qty), 'material_reverse', p_material_id, reference_no, v_uid
  FROM stock_ledger
  WHERE reference_type='picking_material' AND reference_id=p_material_id AND movement_type='outbound';
  DELETE FROM public.picking_list_materials WHERE id=p_material_id;
END; $$;


--
-- Name: delete_sp_dual(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_sp_dual(p_customer_id uuid, p_sp_no text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_status text;
BEGIN
  -- Guard 1: hanya super_admin
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Hanya super_admin yang boleh menghapus SP';
  END IF;

  -- Guard 2 (STRICT): hanya DRAFT
  SELECT status INTO v_status
  FROM sp_orders
  WHERE customer_id = p_customer_id AND sp_no = p_sp_no AND deleted_at IS NULL;

  IF v_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'SP % hanya bisa dihapus saat DRAFT (status: %)',
      p_sp_no, COALESCE(v_status, 'TIDAK ADA');
  END IF;

  DELETE FROM sp_orders WHERE customer_id = p_customer_id AND sp_no = p_sp_no;
  DELETE FROM sp_items  WHERE customer_id = p_customer_id AND sp_no = p_sp_no;
END;
$$;


--
-- Name: dispatch_delivery(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.dispatch_delivery(p_delivery_note_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_company uuid := 'd2e5e565-5f67-4954-b8d9-5979a2a0c697';
        v_status text; v_pick uuid; v_wh uuid; v_no text; v_uid uuid := auth.uid();
        v_cust uuid; v_sp text;
BEGIN
  SELECT status, picking_list_id, do_no, customer_id, sp_no
    INTO v_status, v_pick, v_no, v_cust, v_sp
    FROM delivery_notes WHERE id=p_delivery_note_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Surat jalan tidak ditemukan'; END IF;
  IF v_status <> 'draft' THEN RAISE EXCEPTION 'Hanya surat jalan draft yang bisa diberangkatkan (status=%)', v_status; END IF;
  SELECT warehouse_id INTO v_wh FROM picking_lists WHERE id=v_pick;
  v_wh := COALESCE(v_wh, '303c3d4c-570e-40a1-b738-6b0ed1cb5078');

  INSERT INTO stock_ledger
    (company_id, warehouse_id, product_id, movement_type, qty, reference_type, reference_id, reference_no, created_by)
  SELECT company_id, warehouse_id, product_id, 'unreserved', qty, 'picking', reference_id, reference_no, v_uid
  FROM stock_ledger
  WHERE reference_type='picking' AND reference_id=v_pick AND movement_type='reserved';

  INSERT INTO stock_ledger
    (company_id, warehouse_id, product_id, movement_type, qty, reference_type, reference_id, reference_no, created_by)
  SELECT v_company, v_wh, dni.product_id, 'outbound', -abs(dni.qty), 'delivery', p_delivery_note_id, v_no, v_uid
  FROM delivery_note_items dni
  WHERE dni.delivery_note_id=p_delivery_note_id AND dni.product_id IS NOT NULL AND COALESCE(dni.qty,0) > 0;

  UPDATE delivery_notes SET status='in_transit', dispatched_at=now() WHERE id=p_delivery_note_id;

  WITH agg AS (
    SELECT pli.sp_item_id AS sp_item_id, SUM(dni.qty) AS qty
    FROM delivery_note_items dni
    JOIN picking_list_items pli ON pli.id = dni.picking_list_item_id
    WHERE dni.delivery_note_id = p_delivery_note_id AND COALESCE(dni.qty,0) > 0 AND pli.sp_item_id IS NOT NULL
    GROUP BY pli.sp_item_id
  )
  UPDATE sp_items si SET shipped_qty = si.shipped_qty + agg.qty, updated_at = now()
  FROM agg WHERE si.id = agg.sp_item_id;

  PERFORM sp_recompute_status(v_cust, v_sp);
END; $$;


--
-- Name: exec_sql(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.exec_sql(sql text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  EXECUTE sql;
END;
$$;


--
-- Name: generate_customer_code(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_customer_code() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  yr int := extract(year from coalesce(NEW.created_at, now()))::int;
  next_num int;
  prefix text;
  ckey text;
begin
  if NEW.account_status = 'customer' and (NEW.code is null or NEW.code = '') then
    select code into prefix from public.companies
      where id = coalesce(NEW.owner_company_id, NEW.company_id);
    if prefix is null or prefix = '' then prefix := 'MSI'; end if;

    ckey := prefix || '-CUST';
    insert into public.code_counters (entity, year, last_number)
    values (ckey, yr, 1)
    on conflict (entity, year)
    do update set last_number = public.code_counters.last_number + 1
    returning last_number into next_num;

    NEW.code := prefix || '/CUST/' || yr || '/' || int_to_roman(next_num);
  end if;
  return NEW;
end;
$$;


--
-- Name: generate_delivery_from_picking(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_delivery_from_picking(p_picking_list_id uuid) RETURNS TABLE(delivery_note_id uuid, do_no text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_company_id uuid := 'd2e5e565-5f67-4954-b8d9-5979a2a0c697';
  v_entity text;
  v_year int := EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Jakarta'))::int;
  v_seq int; v_no text; v_dn_id uuid; v_uid uuid := auth.uid();
  v_sp_no text; v_pick_status text;
  v_customer uuid; v_cust_name text; v_addr text;
  v_item_count int;
BEGIN
  SELECT sp_no, status, customer_id INTO v_sp_no, v_pick_status, v_customer
    FROM picking_lists WHERE id = p_picking_list_id;
  IF v_sp_no IS NULL THEN RAISE EXCEPTION 'Picking list tidak ditemukan'; END IF;
  IF v_pick_status <> 'done' THEN RAISE EXCEPTION 'Picking list belum selesai (status=%)', v_pick_status; END IF;
  IF EXISTS (SELECT 1 FROM delivery_notes WHERE picking_list_id = p_picking_list_id AND status <> 'cancelled') THEN
    RAISE EXCEPTION 'Surat jalan untuk picking ini sudah ada'; END IF;
  SELECT count(*) INTO v_item_count FROM picking_list_items
    WHERE picking_list_id = p_picking_list_id AND COALESCE(qty_picked,0) > 0;
  IF v_item_count = 0 THEN RAISE EXCEPTION 'Tak ada item ter-pick untuk dikirim'; END IF;

  IF v_customer IS NULL THEN
    SELECT si.customer_id INTO v_customer FROM sp_items si WHERE si.sp_no = v_sp_no LIMIT 1;
  END IF;
  SELECT a.name, a.address INTO v_cust_name, v_addr FROM accounts a WHERE a.id = v_customer;

  SELECT code INTO v_entity FROM companies WHERE id = v_company_id;
  v_seq := increment_document_sequence(v_company_id, 'SJ', 'WH', v_year, 0);
  v_no  := 'SJ/' || COALESCE(v_entity,'SOA') || '/WH/' || v_year || '/' || lpad(v_seq::text, 4, '0');

  INSERT INTO delivery_notes
    (company_id, do_no, sp_no, picking_list_id, customer_id, customer_name, destination_address, status, created_by)
  VALUES (v_company_id, v_no, v_sp_no, p_picking_list_id, v_customer, v_cust_name, v_addr, 'draft', v_uid)
  RETURNING id INTO v_dn_id;

  INSERT INTO delivery_note_items (delivery_note_id, picking_list_item_id, product_id, product_name, sku, qty)
  SELECT v_dn_id, pli.id, pli.product_id, pli.product_name, pli.sku, pli.qty_picked
  FROM picking_list_items pli
  WHERE pli.picking_list_id = p_picking_list_id AND COALESCE(pli.qty_picked,0) > 0;

  RETURN QUERY SELECT v_dn_id, v_no;
END;
$$;


--
-- Name: generate_picking_from_sp(text, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_picking_from_sp(p_sp_no text, p_customer_id uuid, p_warehouse_id uuid DEFAULT NULL::uuid) RETURNS TABLE(picking_list_id uuid, picking_no text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_company_id uuid := 'd2e5e565-5f67-4954-b8d9-5979a2a0c697';
  v_wh uuid := COALESCE(p_warehouse_id, '303c3d4c-570e-40a1-b738-6b0ed1cb5078');
  v_entity text; v_year int := EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Jakarta'))::int;
  v_seq int; v_no text; v_pl_id uuid; v_uid uuid := auth.uid(); v_outstanding int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sp_items WHERE sp_no=p_sp_no AND customer_id=p_customer_id AND sp_status='confirmed') THEN
    RAISE EXCEPTION 'SP % tidak ditemukan atau belum confirmed', p_sp_no; END IF;
  IF EXISTS (SELECT 1 FROM picking_lists WHERE sp_no=p_sp_no AND customer_id=p_customer_id AND status <> 'cancelled') THEN
    RAISE EXCEPTION 'Picking list untuk SP % sudah ada', p_sp_no; END IF;
  SELECT count(*) INTO v_outstanding FROM sp_items
    WHERE sp_no=p_sp_no AND customer_id=p_customer_id AND sp_status='confirmed' AND (qty - shipped_qty) > 0;
  IF v_outstanding = 0 THEN RAISE EXCEPTION 'SP % tidak punya item outstanding', p_sp_no; END IF;
  SELECT code INTO v_entity FROM companies WHERE id = v_company_id;
  v_seq := increment_document_sequence(v_company_id,'PICK','WH',v_year,0);
  v_no  := 'PICK/'||COALESCE(v_entity,'SOA')||'/WH/'||v_year||'/'||lpad(v_seq::text,4,'0');
  INSERT INTO picking_lists (company_id, picking_no, sp_no, warehouse_id, status, created_by, customer_id)
  VALUES (v_company_id, v_no, p_sp_no, v_wh, 'pending', v_uid, p_customer_id)
  RETURNING id INTO v_pl_id;
  WITH src AS (
    SELECT si.id AS sp_item_id, si.product_id, si.product_name, si.sku,
           GREATEST(si.qty - si.shipped_qty, 0) AS req
    FROM sp_items si
    WHERE si.sp_no=p_sp_no AND si.customer_id=p_customer_id AND si.sp_status='confirmed' AND (si.qty - si.shipped_qty) > 0
  ),
  av AS (
    SELECT src.*,
           COALESCE((SELECT SUM(ss.available) FROM stock_summary ss
                     WHERE ss.company_id = v_company_id AND ss.product_id = src.product_id), 0) AS avail
    FROM src
  ),
  ins_items AS (
    INSERT INTO picking_list_items
      (picking_list_id, sp_item_id, product_id, product_name, sku, qty_requested, qty_short, location_detail)
    SELECT v_pl_id, sp_item_id, product_id, product_name, sku, req,
           CASE WHEN product_id IS NULL THEN 0 ELSE GREATEST(req - LEAST(req, avail), 0) END,
           (SELECT pwl.rack_location FROM product_warehouse_location pwl
             WHERE pwl.product_id = av.product_id AND pwl.warehouse_id = v_wh LIMIT 1)
    FROM av
    RETURNING 1
  )
  INSERT INTO stock_ledger
    (company_id, warehouse_id, product_id, movement_type, qty, reference_type, reference_id, reference_no, created_by)
  SELECT v_company_id, v_wh, product_id, 'reserved', LEAST(req, avail), 'picking', v_pl_id, v_no, v_uid
  FROM av
  WHERE product_id IS NOT NULL AND LEAST(req, avail) > 0;
  PERFORM sp_recompute_status(p_customer_id, p_sp_no);
  RETURN QUERY SELECT v_pl_id, v_no;
END; $$;


--
-- Name: get_table_columns(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_table_columns(p_table text) RETURNS TABLE(column_name text, data_type text)
    LANGUAGE sql SECURITY DEFINER
    AS $$
  SELECT column_name::text, data_type::text
  FROM information_schema.columns
  WHERE table_schema = 'public'
  AND table_name = p_table
  ORDER BY ordinal_position;
$$;


--
-- Name: get_user_company_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_company_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT company_id
  FROM   profiles
  WHERE  id = auth.uid()
$$;


--
-- Name: FUNCTION get_user_company_id(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_user_company_id() IS 'Returns the company_id of the authenticated user from profiles. NULL before Phase 1.0F backfill. Used in all company-scoped RLS policies.';


--
-- Name: get_user_role_code(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_role_code() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT r.code
  FROM user_roles ur
  JOIN roles r ON r.id = ur.role_id
  WHERE ur.user_id = auth.uid()
    AND ur.is_active = true
    AND (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE)
  ORDER BY 
    CASE r.code 
      WHEN 'super_admin' THEN 1
      WHEN 'admin' THEN 2
      ELSE 3
    END
  LIMIT 1
$$;


--
-- Name: guard_quotation_prf_consistency(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_quotation_prf_consistency() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  v_prf_inquiry uuid;
begin
  if new.prf_id is null then
    return new;
  end if;

  select inquiry_id into v_prf_inquiry
  from public.prf
  where id = new.prf_id;

  if v_prf_inquiry is null then
    raise exception 'PRF % tidak punya inquiry_id, tidak bisa jadi dasar quotation', new.prf_id;
  end if;

  if new.inquiry_id is null then
    new.inquiry_id := v_prf_inquiry;
  elsif new.inquiry_id <> v_prf_inquiry then
    raise exception 'inquiry_id quotation (%) tidak cocok dengan inquiry_id PRF (%)',
      new.inquiry_id, v_prf_inquiry;
  end if;

  return new;
end;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_full_name       text;
    v_company_code    text;
    v_branch_code     text;
    v_department_code text;
    v_company_id      uuid;
    v_branch_id       uuid;
    v_department_id   uuid;
BEGIN
    v_full_name       := COALESCE(NEW.raw_user_meta_data->>'full_name',       '');
    v_company_code    := COALESCE(NEW.raw_user_meta_data->>'company_code',    'MSI');
    v_branch_code     := COALESCE(NEW.raw_user_meta_data->>'branch_code',     'HO');
    v_department_code := COALESCE(NEW.raw_user_meta_data->>'department_code', 'IT');

    SELECT id INTO v_company_id
      FROM public.companies WHERE code = v_company_code;

    IF v_company_id IS NULL THEN
        RAISE EXCEPTION
            'handle_new_user: company not found for code "%". '
            'Ensure the company exists in public.companies before creating '
            'auth users for that entity. Valid codes: MSI, JCI, SBI.',
            v_company_code;
    END IF;

    SELECT id INTO v_branch_id
      FROM public.branches
     WHERE company_id = v_company_id AND code = v_branch_code;

    SELECT id INTO v_department_id
      FROM public.departments
     WHERE company_id = v_company_id AND code = v_department_code;

    INSERT INTO public.profiles (
        id,
        full_name,
        active,
        company_id,
        branch_id,
        department_id,
        mfa_required
    )
    VALUES (
        NEW.id,
        v_full_name,
        true,
        v_company_id,
        v_branch_id,
        v_department_id,
        false
    )
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
END;
$$;


--
-- Name: FUNCTION handle_new_user(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.handle_new_user() IS 'Auth trigger: creates a profiles row when a new Supabase Auth user is created. Reads company_code, branch_code, department_code from raw_user_meta_data with defaults MSI / HO / IT. Resolves company_id (required), branch_id and department_id (optional) from master data tables before inserting. Raises an exception if company_code is not found in public.companies. ON CONFLICT (id) DO NOTHING makes it safe to re-run. SECURITY DEFINER + SET search_path = public prevents hijacking. Patched in migration 016 after profiles.company_id became NOT NULL (Phase 1.0F).';


--
-- Name: has_permission(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_permission(module_code text, action_code text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   user_roles     ur
    JOIN   roles           r   ON r.id  = ur.role_id
    JOIN   role_permissions rp ON rp.role_id = r.id
    JOIN   permissions      p  ON p.id  = rp.permission_id
    WHERE  ur.user_id      = auth.uid()
      AND  ur.is_active     = true
      AND  (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE)
      AND  p.module         = module_code
      AND  p.action         = action_code
  )
$$;


--
-- Name: FUNCTION has_permission(module_code text, action_code text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.has_permission(module_code text, action_code text) IS 'True if the current user holds the given {module}.{action} permission through any active role. Performs 3 JOINs — use for mutation checks, not bulk SELECT policies.';


--
-- Name: has_role(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_role(role_code text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   user_roles ur
    JOIN   roles       r  ON r.id  = ur.role_id
    WHERE  ur.user_id      = auth.uid()
      AND  ur.is_active     = true
      AND  r.code           = role_code
      AND  (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE)
  )
$$;


--
-- Name: FUNCTION has_role(role_code text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.has_role(role_code text) IS 'True if the current user holds the specified role code in any active user_roles assignment. Does not fall back to legacy roles.';


--
-- Name: increment_document_sequence(uuid, text, text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_document_sequence(p_company_id uuid, p_document_type text, p_department_code text, p_year integer, p_month integer DEFAULT 0) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_new_seq integer;
BEGIN
  -- Attempt atomic increment on existing row
  UPDATE document_sequences
  SET    last_sequence = last_sequence + 1
  WHERE  company_id      = p_company_id
    AND  document_type   = p_document_type
    AND  department_code = p_department_code
    AND  year            = p_year
    AND  month           = p_month
  RETURNING last_sequence INTO v_new_seq;

  -- If no row existed, insert it and return 1
  IF NOT FOUND THEN
    INSERT INTO document_sequences
      (company_id, document_type, department_code, year, month, last_sequence)
    VALUES
      (p_company_id, p_document_type, p_department_code, p_year, p_month, 1)
    ON CONFLICT (company_id, document_type, department_code, year, month)
    DO UPDATE SET last_sequence = document_sequences.last_sequence + 1
    RETURNING last_sequence INTO v_new_seq;
  END IF;

  RETURN v_new_seq;
END;
$$;


--
-- Name: FUNCTION increment_document_sequence(p_company_id uuid, p_document_type text, p_department_code text, p_year integer, p_month integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.increment_document_sequence(p_company_id uuid, p_document_type text, p_department_code text, p_year integer, p_month integer) IS 'Atomically increments the document sequence counter for the given key. Inserts the row with last_sequence=1 if it does not yet exist. SECURITY DEFINER — bypasses RLS; safe because company_id is validated. Returns the new sequence number.';


--
-- Name: indomarco_dashboard_stats(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.indomarco_dashboard_stats(p_customer_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE
    AS $$
  WITH base AS (
    SELECT
      sp_no,
      qty,
      shipped_qty,
      NULLIF(trim(dc), '') AS dc_trim,
      sp_date::date        AS sp_date
    FROM public.sp_items
    WHERE customer_id = p_customer_id
  ),
  kpi AS (
    SELECT
      COUNT(DISTINCT sp_no) FILTER (WHERE sp_no IS NOT NULL AND sp_no <> '') AS total_sp,
      COALESCE(SUM(qty), 0)         AS total_ordered,
      COALESCE(SUM(shipped_qty), 0) AS total_realized,
      COUNT(DISTINCT dc_trim)       AS dc_count,
      MIN(sp_date)                  AS period_min,
      MAX(sp_date)                  AS period_max
    FROM base
  ),
  dc_vol AS (
    SELECT dc_trim AS dc, COALESCE(SUM(qty), 0) AS volume
    FROM base
    WHERE dc_trim IS NOT NULL
    GROUP BY dc_trim
  ),
  monthly AS (
    SELECT to_char(sp_date, 'YYYY-MM') AS ym,
           COUNT(DISTINCT sp_no) FILTER (WHERE sp_no IS NOT NULL AND sp_no <> '') AS sp_count
    FROM base
    WHERE sp_date IS NOT NULL
    GROUP BY to_char(sp_date, 'YYYY-MM')
  )
  SELECT jsonb_build_object(
    'total_sp',       (SELECT total_sp       FROM kpi),
    'total_ordered',  (SELECT total_ordered  FROM kpi),
    'total_realized', (SELECT total_realized FROM kpi),
    'dc_count',       (SELECT dc_count       FROM kpi),
    'period_min',     (SELECT period_min     FROM kpi),
    'period_max',     (SELECT period_max     FROM kpi),
    'dc_volumes',     COALESCE((SELECT jsonb_agg(jsonb_build_object('dc', dc, 'volume', volume)) FROM dc_vol), '[]'::jsonb),
    'monthly',        COALESCE((SELECT jsonb_agg(jsonb_build_object('ym', ym, 'sp_count', sp_count)) FROM monthly), '[]'::jsonb)
  );
$$;


--
-- Name: int_to_roman(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.int_to_roman(num integer) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    AS $$
declare
  vals int[]  := array[1000,900,500,400,100,90,50,40,10,9,5,4,1];
  syms text[] := array['M','CM','D','CD','C','XC','L','XL','X','IX','V','IV','I'];
  result text := '';
  i int;
begin
  if num is null or num <= 0 then return null; end if;
  for i in 1..array_length(vals,1) loop
    while num >= vals[i] loop
      result := result || syms[i];
      num := num - vals[i];
    end loop;
  end loop;
  return result;
end; $$;


--
-- Name: is_admin_or_above(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin_or_above() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   user_roles ur
    JOIN   roles r ON r.id = ur.role_id
    WHERE  ur.user_id     = auth.uid()
      AND  ur.is_active   = true
      AND  r.code         IN ('super_admin', 'admin')
      AND  (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE)
  )
$$;


--
-- Name: FUNCTION is_admin_or_above(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.is_admin_or_above() IS 'True if current user is admin or super_admin. Includes legacy profiles.role=''super'' fallback for Phase 1.0D→1.0F transition.';


--
-- Name: is_manager_or_above(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_manager_or_above() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid()
      AND r.code IN ('super_admin','admin','ceo','gm','gm_bd','manager','supervisor')
      AND ur.is_active = true
      AND (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE)
  );
$$;


--
-- Name: is_super_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_super_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   user_roles ur
    JOIN   roles r ON r.id = ur.role_id
    WHERE  ur.user_id     = auth.uid()
      AND  ur.is_active   = true
      AND  r.code         = 'super_admin'
      AND  (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE)
  )
$$;


--
-- Name: FUNCTION is_super_admin(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.is_super_admin() IS 'True if the current user holds super_admin role (new user_roles table) or legacy profiles.role=''super''. Legacy fallback removed after Phase 1.0F.';


--
-- Name: log_product_price_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_product_price_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.product_price_history
    (product_id, company_id, old_price, new_price, changed_by, source)
  VALUES
    (NEW.id, NEW.company_id, OLD.default_price, NEW.default_price, auth.uid(), 'product_update');
  RETURN NEW;
END;
$$;


--
-- Name: mark_delivery_delivered(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_delivery_delivered(p_delivery_note_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_status text; v_cust uuid; v_sp text;
BEGIN
  SELECT status, customer_id, sp_no INTO v_status, v_cust, v_sp
    FROM delivery_notes WHERE id=p_delivery_note_id;
  IF v_sp IS NULL THEN RAISE EXCEPTION 'Surat jalan tidak ditemukan'; END IF;
  IF v_status <> 'in_transit' THEN
    RAISE EXCEPTION 'Hanya surat jalan in_transit yang bisa ditandai terkirim (status=%)', v_status; END IF;
  UPDATE delivery_notes SET status='delivered', delivered_at=now() WHERE id=p_delivery_note_id;
  PERFORM sp_recompute_status(v_cust, v_sp);
END; $$;


--
-- Name: save_prf_pricing(uuid, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_prf_pricing(p_prf_id uuid, p_header jsonb, p_items jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_count   int;
  v_vendors int;
BEGIN
  -- 1) Header jawaban harga (RLS prf_update_status: procurement + status='SUBMITTED').
  UPDATE public.prf SET
    suggested_rate = NULLIF(p_header->>'suggested_rate','')::numeric,
    rate_currency  = COALESCE(NULLIF(p_header->>'rate_currency',''), 'IDR'),
    valid_from     = NULLIF(p_header->>'valid_from','')::date,
    valid_until    = NULLIF(p_header->>'valid_until','')::date,
    pricing_notes  = NULLIF(p_header->>'pricing_notes',''),
    exchange_rates = COALESCE(p_header->'exchange_rates', exchange_rates),
    answered_by    = auth.uid(),
    answered_at    = now()
  WHERE id = p_prf_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'PRF tidak ditemukan atau tidak ada izin menyimpan jawaban harga (RLS).';
  END IF;

  IF p_items IS NOT NULL AND jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'save_prf_pricing: p_items harus jsonb array (atau NULL), tetapi menerima jsonb_typeof = %', jsonb_typeof(p_items);
  END IF;

  -- Guard aturan bisnis: satu PRF hanya boleh punya SATU vendor pemenang.
  IF p_items IS NOT NULL THEN
    SELECT count(DISTINCT it->>'vendor_id') INTO v_vendors
    FROM jsonb_array_elements(p_items) AS it
    WHERE COALESCE(NULLIF(it->>'is_awarded','')::boolean, true) = true
      AND NULLIF(it->>'vendor_id','') IS NOT NULL;

    IF v_vendors > 1 THEN
      RAISE EXCEPTION 'save_prf_pricing: hanya boleh satu vendor pemenang per PRF, tetapi menerima % vendor ter-award.', v_vendors;
    END IF;
  END IF;

  -- 2) Replace rincian biaya (RLS prf_cost_items_delete + _insert: procurement + SUBMITTED).
  DELETE FROM public.prf_cost_items WHERE prf_id = p_prf_id;

  IF p_items IS NOT NULL AND jsonb_typeof(p_items) = 'array' THEN
    INSERT INTO public.prf_cost_items (
      prf_id, component, cost_type, amount, currency, sort_order, notes,
      vendor_id, item_group, is_awarded, exchange_rate
    )
    SELECT p_prf_id,
      it->>'component',
      CASE WHEN (it->>'cost_type') = 'internal' THEN 'internal' ELSE 'vendor' END,
      COALESCE(NULLIF(it->>'amount','')::numeric, 0),
      COALESCE(NULLIF(it->>'currency',''), 'IDR'),
      COALESCE(NULLIF(it->>'sort_order','')::int, 0),
      NULLIF(it->>'notes',''),
      NULLIF(it->>'vendor_id','')::uuid,
      NULLIF(it->>'item_group',''),
      COALESCE(NULLIF(it->>'is_awarded','')::boolean, true),
      COALESCE(NULLIF(it->>'exchange_rate','')::numeric, 1)
    FROM jsonb_array_elements(p_items) AS it;
  END IF;

  RETURN jsonb_build_object('ok', true, 'prf_id', p_prf_id);
END;
$$;


--
-- Name: save_quotation(uuid, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_quotation(p_quotation_id uuid, p_header jsonb, p_items jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE v_count int;
BEGIN
  UPDATE public.quotations SET
    quotation_no     = COALESCE(p_header->>'quotation_no', quotation_no),
    quote_date       = COALESCE(NULLIF(p_header->>'quote_date','')::date, quote_date),
    inquiry_id       = COALESCE(NULLIF(p_header->>'inquiry_id','')::uuid, inquiry_id),
    prospect_id      = COALESCE(NULLIF(p_header->>'prospect_id','')::uuid, prospect_id),
    customer_id      = COALESCE(NULLIF(p_header->>'customer_id','')::uuid, customer_id),
    service_type     = COALESCE(p_header->>'service_type', service_type),
    valid_until      = COALESCE(NULLIF(p_header->>'valid_until','')::date, valid_until),
    payment_terms_id = COALESCE(NULLIF(p_header->>'payment_terms_id','')::uuid, payment_terms_id),
    currency_code    = COALESCE(p_header->>'currency_code', currency_code),
    exchange_rates   = CASE WHEN p_header ? 'exchange_rates' THEN p_header->'exchange_rates' ELSE exchange_rates END,
    notes            = CASE WHEN p_header ? 'notes'          THEN p_header->>'notes'          ELSE notes          END,
    terms            = CASE WHEN p_header ? 'terms'          THEN p_header->>'terms'          ELSE terms          END,
    internal_notes   = CASE WHEN p_header ? 'internal_notes' THEN p_header->>'internal_notes' ELSE internal_notes END,
    route            = CASE WHEN p_header ? 'route'          THEN p_header->>'route'          ELSE route          END,
    subtotal         = COALESCE(NULLIF(p_header->>'subtotal','')::numeric, subtotal),
    tax_amount       = COALESCE(NULLIF(p_header->>'tax_amount','')::numeric, tax_amount),
    total_amount     = COALESCE(NULLIF(p_header->>'total_amount','')::numeric, total_amount),
    vat_rate         = COALESCE(NULLIF(p_header->>'vat_rate','')::numeric, vat_rate),
    status           = COALESCE(p_header->>'status', status),
    usd_rate         = COALESCE(NULLIF(p_header->>'usd_rate','')::numeric, usd_rate),
    discount_pct     = COALESCE(NULLIF(p_header->>'discount_pct','')::numeric, discount_pct),
    margin_floor     = COALESCE(NULLIF(p_header->>'margin_floor','')::numeric, margin_floor),
    pricing_done_at  = COALESCE(NULLIF(p_header->>'pricing_done_at','')::timestamptz, pricing_done_at),
    attention_to     = CASE WHEN p_header ? 'attention_to'     THEN p_header->>'attention_to'     ELSE attention_to     END,
    pickup_address   = CASE WHEN p_header ? 'pickup_address'   THEN p_header->>'pickup_address'   ELSE pickup_address   END,
    delivery_address = CASE WHEN p_header ? 'delivery_address' THEN p_header->>'delivery_address' ELSE delivery_address END,
    cargo_mode       = CASE WHEN p_header ? 'cargo_mode'       THEN p_header->>'cargo_mode'       ELSE cargo_mode       END,
    gw               = CASE WHEN p_header ? 'gw'               THEN p_header->>'gw'               ELSE gw               END,
    dimension        = CASE WHEN p_header ? 'dimension'        THEN p_header->>'dimension'        ELSE dimension        END,
    cw               = CASE WHEN p_header ? 'cw'               THEN p_header->>'cw'               ELSE cw               END,
    cbm              = CASE WHEN p_header ? 'cbm'              THEN p_header->>'cbm'              ELSE cbm              END,
    container_type   = CASE WHEN p_header ? 'container_type'   THEN p_header->>'container_type'   ELSE container_type   END,
    container_qty    = CASE WHEN p_header ? 'container_qty'    THEN NULLIF(p_header->>'container_qty','')::int ELSE container_qty END,
    updated_at       = now(),
    updated_by       = auth.uid()
  WHERE id = p_quotation_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'Quotation tidak ditemukan atau tidak ada izin edit (RLS).';
  END IF;

  DELETE FROM public.quotation_items WHERE quotation_id = p_quotation_id;

  IF p_items IS NOT NULL AND jsonb_typeof(p_items) = 'array' THEN
    INSERT INTO public.quotation_items (
      quotation_id, sort_order, description, qty, unit, unit_price, notes,
      group_name, currency, unit_label, exchange_rate, total, cost_price,
      if_any
    )
    SELECT p_quotation_id,
      COALESCE(NULLIF(it->>'sort_order','')::int, 0),
      it->>'description',
      NULLIF(it->>'qty','')::numeric,
      it->>'unit',
      NULLIF(it->>'unit_price','')::numeric,
      it->>'notes',
      it->>'group_name',
      it->>'currency',
      it->>'unit_label',
      NULLIF(it->>'exchange_rate','')::numeric,
      NULLIF(it->>'total','')::numeric,
      NULLIF(it->>'cost_price','')::numeric,
      COALESCE((it->>'if_any')::boolean, false)
    FROM jsonb_array_elements(p_items) AS it;
  END IF;

  RETURN jsonb_build_object('ok', true, 'quotation_id', p_quotation_id);
END;
$$;


--
-- Name: set_customer_on_inquiry_won(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_customer_on_inquiry_won() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_account_id uuid;
BEGIN
  IF NEW.status <> 'WON' THEN RETURN NEW; END IF;
  IF NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'WON' THEN RETURN NEW; END IF;

  v_account_id := COALESCE(NEW.prospect_id, NEW.customer_id);
  IF v_account_id IS NULL THEN RETURN NEW; END IF;

  UPDATE public.accounts
  SET account_status     = 'customer',
      became_customer_at = COALESCE(became_customer_at, now()),
      converted_at       = COALESCE(converted_at, now())
  WHERE id = v_account_id
    AND COALESCE(account_status,'') <> 'customer'
    AND deleted_at IS NULL;

  RETURN NEW;
END;
$$;


--
-- Name: set_customer_on_won(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_customer_on_won() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.pipeline_stage = 'WON' AND COALESCE(NEW.account_status,'') <> 'customer' THEN
    NEW.account_status     := 'customer';
    NEW.became_customer_at := COALESCE(NEW.became_customer_at, now());
    NEW.converted_at       := COALESCE(NEW.converted_at, now());
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: set_inquiry_quoted_on_quotation_sent(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_inquiry_quoted_on_quotation_sent() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.status = 'SENT'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'SENT')
     AND NEW.inquiry_id IS NOT NULL THEN
    UPDATE public.inquiries
    SET status = 'QUOTED', updated_at = now()
    WHERE id = NEW.inquiry_id
      AND deleted_at IS NULL
      AND status IN ('OPEN','IN_REVIEW');
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: set_inquiry_review_on_prf_submit(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_inquiry_review_on_prf_submit() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.status = 'SUBMITTED'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'SUBMITTED')
     AND NEW.inquiry_id IS NOT NULL THEN
    UPDATE public.inquiries
    SET status = 'IN_REVIEW', updated_at = now()
    WHERE id = NEW.inquiry_id
      AND deleted_at IS NULL
      AND status = 'OPEN';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: set_inquiry_won_on_so(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_inquiry_won_on_so() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.status <> 'SENT' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'SENT' THEN RETURN NEW; END IF;
  IF NEW.inquiry_id IS NULL THEN RETURN NEW; END IF;

  UPDATE public.inquiries
  SET status = 'WON', updated_at = now()
  WHERE id = NEW.inquiry_id
    AND deleted_at IS NULL
    AND status IN ('OPEN','IN_REVIEW','QUOTED','NEGOTIATION');

  RETURN NEW;
END;
$$;


--
-- Name: set_product_category_prices(uuid, numeric, numeric, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_product_category_prices(p_product_id uuid, p_semester numeric, p_tahunan numeric, p_project numeric) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_company uuid; v_cur numeric;
        v_cols text[] := ARRAY['semester','tahunan','project'];
        v_new  numeric[]; v_c text; v_i int;
BEGIN
  SELECT company_id INTO v_company FROM products WHERE id = p_product_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Produk tidak ditemukan: %', p_product_id; END IF;
  IF NOT (is_super_admin() OR (v_company = get_user_company_id() AND is_admin_or_above())) THEN
    RAISE EXCEPTION 'Tidak diizinkan mengubah harga produk ini';
  END IF;
  IF (p_semester IS NOT NULL AND p_semester < 0)
     OR (p_tahunan IS NOT NULL AND p_tahunan < 0)
     OR (p_project IS NOT NULL AND p_project < 0) THEN
    RAISE EXCEPTION 'Harga tidak boleh negatif';
  END IF;
  v_new := ARRAY[p_semester, p_tahunan, p_project];
  FOR v_i IN 1..3 LOOP
    v_c := v_cols[v_i];
    SELECT CASE v_c WHEN 'semester' THEN price_semester
                    WHEN 'tahunan'  THEN price_tahunan
                    ELSE price_project END
      INTO v_cur FROM products WHERE id = p_product_id;
    IF v_cur IS DISTINCT FROM v_new[v_i] THEN
      IF v_c = 'semester' THEN UPDATE products SET price_semester = v_new[v_i] WHERE id = p_product_id;
      ELSIF v_c = 'tahunan' THEN UPDATE products SET price_tahunan = v_new[v_i] WHERE id = p_product_id;
      ELSE UPDATE products SET price_project = v_new[v_i] WHERE id = p_product_id; END IF;
      INSERT INTO product_price_history
        (product_id, company_id, old_price, new_price, changed_by, source, price_category)
      VALUES (p_product_id, v_company, v_cur, v_new[v_i], auth.uid(), 'category_edit', v_c);
    END IF;
  END LOOP;
END; $$;


--
-- Name: set_prospect_on_inquiry(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_prospect_on_inquiry() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE public.accounts
  SET account_status = 'prospect'
  WHERE id = COALESCE(NEW.prospect_id, NEW.customer_id)
    AND account_status IN ('lead','mql','sql');
  RETURN NEW;
END;
$$;


--
-- Name: set_sp_status(text, text, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_sp_status(p_sp_no text, p_status text, p_reason text, p_customer_id uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_uid uuid := auth.uid(); v_count integer;
BEGIN
  IF p_status NOT IN ('draft','confirmed','cancelled') THEN RAISE EXCEPTION 'invalid sp_status: %', p_status; END IF;
  UPDATE public.sp_items
     SET sp_status=p_status,
         confirmed_at = CASE WHEN p_status='confirmed' THEN now()    ELSE confirmed_at  END,
         confirmed_by = CASE WHEN p_status='confirmed' THEN v_uid    ELSE confirmed_by  END,
         cancelled_at = CASE WHEN p_status='cancelled' THEN now()    ELSE cancelled_at  END,
         cancelled_by = CASE WHEN p_status='cancelled' THEN v_uid    ELSE cancelled_by  END,
         cancel_reason= CASE WHEN p_status='cancelled' THEN p_reason ELSE cancel_reason END,
         updated_at   = now()
   WHERE sp_no = p_sp_no AND customer_id = p_customer_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF p_status = 'cancelled' THEN
    UPDATE public.sp_orders
       SET status='CANCELLED', cancelled_at=now(), cancelled_by=v_uid, cancel_reason=p_reason, updated_at=now()
     WHERE customer_id=p_customer_id AND sp_no=p_sp_no AND status <> 'CANCELLED';
  ELSE
    IF p_status='confirmed' THEN
      UPDATE public.sp_orders
         SET confirmed_at=COALESCE(confirmed_at,now()), confirmed_by=COALESCE(confirmed_by,v_uid), updated_at=now()
       WHERE customer_id=p_customer_id AND sp_no=p_sp_no AND status <> 'CANCELLED';
    END IF;
    PERFORM sp_recompute_status(p_customer_id, p_sp_no);
  END IF;
  RETURN v_count;
END; $$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


--
-- Name: FUNCTION set_updated_at(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.set_updated_at() IS 'Trigger function: sets updated_at = now() before every UPDATE. Defined in migration 000 (legacy baseline) and reused by all subsequent migrations via CREATE OR REPLACE — safe to re-run.';


--
-- Name: sp_delete_btb(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_delete_btb(p_btb_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_cust uuid; v_sp text;
BEGIN
  SELECT b.customer_id, o.sp_no INTO v_cust, v_sp
    FROM sp_btb b JOIN sp_orders o ON o.id = b.sp_order_id
   WHERE b.id = p_btb_id AND b.deleted_at IS NULL;
  IF v_sp IS NULL THEN RAISE EXCEPTION 'BTB tidak ditemukan atau sudah dihapus.'; END IF;
  UPDATE sp_btb SET deleted_at = now() WHERE id = p_btb_id;
  PERFORM sp_recompute_status(v_cust, v_sp);
END; $$;


--
-- Name: sp_issue_btb(uuid, text, text, integer, date, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_issue_btb(p_customer_id uuid, p_sp_no text, p_btb_no text, p_qty integer DEFAULT NULL::integer, p_btb_date date DEFAULT NULL::date, p_delivery_note_id uuid DEFAULT NULL::uuid, p_remarks text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_company uuid; v_sp_order_id uuid; v_uid uuid := auth.uid();
  v_btb_id uuid; v_existing uuid;
BEGIN
  IF btrim(COALESCE(p_btb_no,'')) = '' THEN
    RAISE EXCEPTION 'Nomor BTB wajib diisi.'; END IF;
  SELECT id, company_id INTO v_sp_order_id, v_company
    FROM sp_orders
   WHERE customer_id = p_customer_id AND sp_no = p_sp_no AND deleted_at IS NULL;
  IF v_sp_order_id IS NULL THEN
    RAISE EXCEPTION 'SP % untuk customer ini tidak ditemukan.', p_sp_no; END IF;
  IF p_delivery_note_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM delivery_notes
        WHERE id = p_delivery_note_id AND customer_id = p_customer_id AND sp_no = p_sp_no) THEN
    RAISE EXCEPTION 'Surat jalan bukan milik SP ini.'; END IF;
  SELECT id INTO v_existing FROM sp_btb
   WHERE customer_id = p_customer_id AND btb_no = btrim(p_btb_no) AND deleted_at IS NULL;
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  INSERT INTO sp_btb (company_id, sp_order_id, delivery_note_id, customer_id,
                      btb_no, btb_date, qty, received_at, received_by, remarks)
  VALUES (v_company, v_sp_order_id, p_delivery_note_id, p_customer_id,
          btrim(p_btb_no), p_btb_date, p_qty, now(), v_uid,
          NULLIF(btrim(COALESCE(p_remarks,'')),''))
  RETURNING id INTO v_btb_id;
  PERFORM sp_recompute_status(p_customer_id, p_sp_no);
  RETURN v_btb_id;
END; $$;


--
-- Name: sp_recompute_status(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_recompute_status(p_customer_id uuid, p_sp_no text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_company uuid := 'd2e5e565-5f67-4954-b8d9-5979a2a0c697';
  v_id uuid; v_status text; v_new text;
  v_confirmed bool; v_has_done bool; v_has_active bool; v_short bool;
  v_ordered int; v_shipped int; v_has_dispatch bool; v_has_delivered bool;
  v_has_btb bool;
BEGIN
  SELECT id, status INTO v_id, v_status
    FROM sp_orders WHERE customer_id=p_customer_id AND sp_no=p_sp_no AND deleted_at IS NULL;
  IF v_id IS NULL THEN RETURN; END IF;
  IF v_status IN ('CANCELLED','INVOICED','SUBMITTED','LUNAS') THEN RETURN; END IF;
  v_confirmed  := EXISTS(SELECT 1 FROM sp_items WHERE customer_id=p_customer_id AND sp_no=p_sp_no AND sp_status='confirmed');
  v_has_done   := EXISTS(SELECT 1 FROM picking_lists WHERE customer_id=p_customer_id AND sp_no=p_sp_no AND status='done');
  v_has_active := EXISTS(SELECT 1 FROM picking_lists WHERE customer_id=p_customer_id AND sp_no=p_sp_no AND status IN ('pending','in_progress'));
  v_short := EXISTS(
    SELECT 1 FROM sp_items si
     WHERE si.customer_id=p_customer_id AND si.sp_no=p_sp_no
       AND si.sp_status='confirmed' AND (si.qty - si.shipped_qty) > 0
       AND (si.qty - si.shipped_qty) > COALESCE(
             (SELECT SUM(ss.available) FROM stock_summary ss
               WHERE ss.company_id=v_company AND ss.product_id=si.product_id), 0));
  SELECT COALESCE(SUM(qty),0), COALESCE(SUM(shipped_qty),0) INTO v_ordered, v_shipped
    FROM sp_items WHERE customer_id=p_customer_id AND sp_no=p_sp_no AND sp_status='confirmed';
  v_has_dispatch  := EXISTS(SELECT 1 FROM delivery_notes WHERE customer_id=p_customer_id AND sp_no=p_sp_no AND status IN ('in_transit','delivered'));
  v_has_delivered := EXISTS(SELECT 1 FROM delivery_notes WHERE customer_id=p_customer_id AND sp_no=p_sp_no AND status='delivered');
  v_has_btb := EXISTS(SELECT 1 FROM sp_btb WHERE sp_order_id=v_id AND deleted_at IS NULL);
  v_new := CASE
    WHEN v_has_btb                                THEN 'BTB_TERBIT'
    WHEN v_ordered > 0 AND v_shipped >= v_ordered THEN 'TERKIRIM_PENUH'
    WHEN v_has_delivered                          THEN 'SAMPAI'
    WHEN v_has_dispatch                           THEN 'DIKIRIM'
    WHEN v_has_done                               THEN 'PACKED'
    WHEN v_has_active                             THEN 'PICKING'
    WHEN v_confirmed AND v_short                  THEN 'MENUNGGU_STOK'
    WHEN v_confirmed                              THEN 'CONFIRMED'
    ELSE 'DRAFT' END;
  IF v_new IS DISTINCT FROM v_status THEN
    UPDATE sp_orders SET status=v_new, updated_at=now() WHERE id=v_id AND status <> 'CANCELLED';
  END IF;
END; $$;


--
-- Name: storbit_sp_customers(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.storbit_sp_customers() RETURNS jsonb
    LANGUAGE sql STABLE
    AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object('customer_id', customer_id, 'name', name)
      ORDER BY name
    ),
    '[]'::jsonb
  )
  FROM (
    SELECT DISTINCT a.id AS customer_id, a.name AS name
    FROM public.sp_items s
    JOIN public.accounts a ON a.id = s.customer_id
    WHERE s.customer_id IS NOT NULL
      AND a.company_id = 'd2e5e565-5f67-4954-b8d9-5979a2a0c697'
  ) t;
$$;


--
-- Name: sync_deal_value_on_quotation_accept(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_deal_value_on_quotation_accept() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Hanya trigger kalau status berubah jadi 'ACCEPTED'
  IF NEW.status = 'ACCEPTED' AND (OLD.status IS DISTINCT FROM 'ACCEPTED') THEN
    -- Update estimated_value di accounts via prospect_id
    IF NEW.prospect_id IS NOT NULL THEN
      UPDATE public.accounts
      SET estimated_value = NEW.total_amount,
          updated_at = now()
      WHERE id = NEW.prospect_id;
    END IF;
    -- Update juga via customer_id kalau prospect_id null
    IF NEW.prospect_id IS NULL AND NEW.customer_id IS NOT NULL THEN
      UPDATE public.accounts
      SET estimated_value = NEW.total_amount,
          updated_at = now()
      WHERE id = NEW.customer_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: sync_last_activity_on_account(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_last_activity_on_account() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_account_id uuid;
BEGIN
  v_account_id := COALESCE(NEW.account_id, OLD.account_id);
  IF v_account_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  UPDATE accounts a
  SET last_activity_at = (
    SELECT max(COALESCE(act.completed_at, act.created_at))
    FROM activities act
    WHERE act.account_id = v_account_id
      AND act.deleted_at IS NULL
  )
  WHERE a.id = v_account_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: sync_profile_email(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_profile_email() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.email = (SELECT email FROM auth.users WHERE id = NEW.id);
  RETURN NEW;
END;
$$;


--
-- Name: track_stage_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.track_stage_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.pipeline_stage IS DISTINCT FROM OLD.pipeline_stage THEN
    NEW.stage_changed_at = now();
  END IF;
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    name text NOT NULL,
    legal_name character varying,
    customer_type character varying,
    tax_id character varying,
    address text,
    city character varying,
    country character varying DEFAULT 'Indonesia'::character varying,
    phone character varying,
    email character varying,
    pic_name character varying,
    pic_phone character varying,
    pic_email character varying,
    source character varying,
    assigned_to uuid,
    pipeline_stage character varying DEFAULT 'NEW'::character varying,
    lost_reason text,
    converted_at timestamp with time zone,
    converted_to uuid,
    payment_terms_id uuid,
    currency_code character varying DEFAULT 'IDR'::character varying,
    credit_limit numeric,
    notes text,
    is_active boolean DEFAULT true,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone,
    estimated_closing_date date,
    assigned_profile uuid,
    company_prefix text,
    won_reason text,
    bant_commodity text,
    bant_origin text,
    bant_destination text,
    bant_frequency text,
    bant_current_vendor text,
    bant_payment text,
    bant_decision_maker text,
    bant_score integer DEFAULT 0,
    account_status character varying(50) DEFAULT 'lead'::character varying,
    owner_company_id uuid,
    tier character varying(20),
    code text,
    nomor_kontrak text,
    default_dc text,
    last_activity_at timestamp with time zone DEFAULT now(),
    became_customer_at timestamp with time zone,
    estimated_value numeric DEFAULT 0,
    bant_budget smallint DEFAULT 0,
    bant_authority smallint DEFAULT 0,
    bant_need smallint DEFAULT 0,
    bant_timeline smallint DEFAULT 0,
    stage_changed_at timestamp with time zone DEFAULT now(),
    is_in_lead_pool boolean DEFAULT false,
    lead_pool_reason text,
    lead_pool_at timestamp with time zone,
    pull_justification text,
    pull_requested_at timestamp with time zone,
    pull_approved_by uuid,
    pull_approved_at timestamp with time zone,
    pull_status text,
    is_odoo_customer boolean DEFAULT false NOT NULL,
    CONSTRAINT accounts_account_status_check CHECK (((account_status)::text = ANY ((ARRAY['lead'::character varying, 'mql'::character varying, 'sql'::character varying, 'prospect'::character varying, 'customer'::character varying, 'free_agent'::character varying, 'lost'::character varying])::text[]))),
    CONSTRAINT accounts_pull_status_check CHECK ((pull_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]))),
    CONSTRAINT prospects_source_check CHECK (((source)::text = ANY (ARRAY['sales_visit'::text, 'cold_call'::text, 'referral'::text, 'existing_network'::text, 'exhibition'::text, 'instagram'::text, 'linkedin'::text, 'tiktok'::text, 'website'::text, 'walk_in'::text, 'other'::text])))
);


--
-- Name: accounts_dedup_backup_20260722; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accounts_dedup_backup_20260722 (
    id uuid,
    company_id uuid,
    name text,
    legal_name character varying,
    customer_type character varying,
    tax_id character varying,
    address text,
    city character varying,
    country character varying,
    phone character varying,
    email character varying,
    pic_name character varying,
    pic_phone character varying,
    pic_email character varying,
    source character varying,
    assigned_to uuid,
    pipeline_stage character varying,
    lost_reason text,
    converted_at timestamp with time zone,
    converted_to uuid,
    payment_terms_id uuid,
    currency_code character varying,
    credit_limit numeric,
    notes text,
    is_active boolean,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone,
    estimated_closing_date date,
    assigned_profile uuid,
    company_prefix text,
    won_reason text,
    bant_commodity text,
    bant_origin text,
    bant_destination text,
    bant_frequency text,
    bant_current_vendor text,
    bant_payment text,
    bant_decision_maker text,
    bant_score integer,
    account_status character varying(50),
    owner_company_id uuid,
    tier character varying(20),
    code text,
    nomor_kontrak text,
    default_dc text,
    last_activity_at timestamp with time zone,
    became_customer_at timestamp with time zone,
    estimated_value numeric,
    bant_budget smallint,
    bant_authority smallint,
    bant_need smallint,
    bant_timeline smallint,
    stage_changed_at timestamp with time zone,
    is_in_lead_pool boolean,
    lead_pool_reason text,
    lead_pool_at timestamp with time zone,
    pull_justification text,
    pull_requested_at timestamp with time zone,
    pull_approved_by uuid,
    pull_approved_at timestamp with time zone,
    pull_status text,
    is_odoo_customer boolean
);


--
-- Name: accounts_fase3_backup_20260722; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accounts_fase3_backup_20260722 (
    id uuid,
    company_id uuid,
    name text,
    legal_name character varying,
    customer_type character varying,
    tax_id character varying,
    address text,
    city character varying,
    country character varying,
    phone character varying,
    email character varying,
    pic_name character varying,
    pic_phone character varying,
    pic_email character varying,
    source character varying,
    assigned_to uuid,
    pipeline_stage character varying,
    lost_reason text,
    converted_at timestamp with time zone,
    converted_to uuid,
    payment_terms_id uuid,
    currency_code character varying,
    credit_limit numeric,
    notes text,
    is_active boolean,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone,
    estimated_closing_date date,
    assigned_profile uuid,
    company_prefix text,
    won_reason text,
    bant_commodity text,
    bant_origin text,
    bant_destination text,
    bant_frequency text,
    bant_current_vendor text,
    bant_payment text,
    bant_decision_maker text,
    bant_score integer,
    account_status character varying(50),
    owner_company_id uuid,
    tier character varying(20),
    code text,
    nomor_kontrak text,
    default_dc text,
    last_activity_at timestamp with time zone,
    became_customer_at timestamp with time zone,
    estimated_value numeric,
    bant_budget smallint,
    bant_authority smallint,
    bant_need smallint,
    bant_timeline smallint,
    stage_changed_at timestamp with time zone,
    is_in_lead_pool boolean,
    lead_pool_reason text,
    lead_pool_at timestamp with time zone,
    pull_justification text,
    pull_requested_at timestamp with time zone,
    pull_approved_by uuid,
    pull_approved_at timestamp with time zone,
    pull_status text,
    is_odoo_customer boolean
);


--
-- Name: accounts_lifecycle_backup_20260718; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accounts_lifecycle_backup_20260718 (
    id uuid,
    account_status character varying(50),
    pipeline_stage character varying,
    is_in_lead_pool boolean,
    deleted_at timestamp with time zone
);


--
-- Name: activities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    account_id uuid,
    inquiry_id uuid,
    quotation_id uuid,
    assigned_to uuid,
    type text NOT NULL,
    status text DEFAULT 'todo'::text NOT NULL,
    scheduled_for date,
    activity_time time without time zone,
    completed_at timestamp with time zone,
    prospect_name text,
    contact_name text,
    contact_phone text,
    outcome text,
    notes text,
    next_action text,
    next_action_date date,
    details jsonb DEFAULT '{}'::jsonb,
    migrated_from text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone
);


--
-- Name: activity_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    activity_id uuid NOT NULL,
    changed_by uuid,
    changed_at timestamp with time zone DEFAULT now(),
    from_status text,
    to_status text,
    notes text
);


--
-- Name: app_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    category text NOT NULL,
    key text NOT NULL,
    value jsonb,
    updated_at timestamp with time zone DEFAULT now(),
    updated_by uuid
);


--
-- Name: approval_delegations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.approval_delegations (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    delegator_id uuid NOT NULL,
    delegate_id uuid NOT NULL,
    document_types jsonb DEFAULT '[]'::jsonb NOT NULL,
    valid_from timestamp with time zone NOT NULL,
    valid_until timestamp with time zone NOT NULL,
    reason text,
    approved_by uuid,
    approved_at timestamp with time zone,
    is_active boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT approval_delegations_dates_valid CHECK ((valid_until > valid_from)),
    CONSTRAINT approval_delegations_no_self_delegate CHECK ((delegator_id <> delegate_id))
);


--
-- Name: TABLE approval_delegations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.approval_delegations IS 'Temporary approval authority delegation. Must be approved by Admin before taking effect.';


--
-- Name: COLUMN approval_delegations.delegator_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.approval_delegations.delegator_id IS 'The user who is delegating their approval authority (e.g. a manager going on leave).';


--
-- Name: COLUMN approval_delegations.delegate_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.approval_delegations.delegate_id IS 'The user receiving temporary approval authority.';


--
-- Name: COLUMN approval_delegations.document_types; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.approval_delegations.document_types IS 'JSON array of document type codes this delegation covers. Empty array [] = all types.';


--
-- Name: COLUMN approval_delegations.is_active; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.approval_delegations.is_active IS 'False = pending Admin approval. True = delegation is in effect. Auto-expires at valid_until.';


--
-- Name: approval_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.approval_logs (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    document_type character varying(20) NOT NULL,
    document_id uuid NOT NULL,
    document_no character varying(100),
    action character varying(30) NOT NULL,
    from_status character varying(50) NOT NULL,
    to_status character varying(50) NOT NULL,
    actor_id uuid NOT NULL,
    sequence_level smallint DEFAULT 1 NOT NULL,
    notes text,
    acted_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT approval_logs_action_check CHECK (((action)::text = ANY ((ARRAY['submit'::character varying, 'approve'::character varying, 'reject'::character varying, 'revision_requested'::character varying, 'revise'::character varying, 'cancel'::character varying, 'delegate'::character varying, 'on_hold'::character varying, 'resume'::character varying])::text[])))
);


--
-- Name: TABLE approval_logs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.approval_logs IS 'Immutable approval action audit trail. Append-only — never UPDATE or DELETE rows. One row per approval action.';


--
-- Name: COLUMN approval_logs.document_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.approval_logs.document_id IS 'UUID of the document row in its own table (quotations.id, sales_orders.id, etc.). Not a hard FK — keeps the engine module-agnostic.';


--
-- Name: COLUMN approval_logs.document_no; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.approval_logs.document_no IS 'Human-readable document number (e.g. QT/MSI/SLS/2026/0001). Stored for fast display without a join.';


--
-- Name: COLUMN approval_logs.action; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.approval_logs.action IS 'What happened: submit, approve, reject, revision_requested, revise, cancel, delegate, on_hold, resume.';


--
-- Name: COLUMN approval_logs.sequence_level; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.approval_logs.sequence_level IS 'Which approval level was actioned (1 = first approver, 2 = second, etc.).';


--
-- Name: approval_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.approval_rules (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    document_type character varying(20) NOT NULL,
    department_id uuid,
    min_amount numeric(18,2) DEFAULT 0,
    max_amount numeric(18,2),
    approver_role_id uuid,
    approver_user_id uuid,
    backup_approver_id uuid,
    sequence_order smallint DEFAULT 1 NOT NULL,
    deadline_hours smallint,
    notes text,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT approval_rules_approver_required CHECK (((approver_role_id IS NOT NULL) OR (approver_user_id IS NOT NULL)))
);


--
-- Name: TABLE approval_rules; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.approval_rules IS 'Reusable approval engine rules. Company-scoped, module-agnostic. Multi-level supported via sequence_order. See docs/workflow/approval-engine.md.';


--
-- Name: COLUMN approval_rules.document_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.approval_rules.document_type IS 'Document type code (e.g. QT, SP, PO). Stored as varchar — NOT a FK to document_types to keep the engine decoupled.';


--
-- Name: COLUMN approval_rules.department_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.approval_rules.department_id IS 'If set, rule applies only to documents from this department. NULL = applies to all departments.';


--
-- Name: COLUMN approval_rules.min_amount; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.approval_rules.min_amount IS 'Minimum document amount this rule applies to. 0 or NULL = no lower bound.';


--
-- Name: COLUMN approval_rules.max_amount; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.approval_rules.max_amount IS 'Maximum document amount this rule applies to. NULL = no upper limit.';


--
-- Name: COLUMN approval_rules.sequence_order; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.approval_rules.sequence_order IS 'Approval level sequence. Level 1 must complete before Level 2 is triggered.';


--
-- Name: COLUMN approval_rules.deadline_hours; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.approval_rules.deadline_hours IS 'Hours within which the approver must act. NULL = no deadline. Enables escalation on overdue.';


--
-- Name: approval_workflow_steps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.approval_workflow_steps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workflow_id uuid NOT NULL,
    step_order integer NOT NULL,
    approver_type character varying DEFAULT 'role'::character varying NOT NULL,
    approver_role character varying,
    approver_user_id uuid,
    is_required boolean DEFAULT true NOT NULL,
    timeout_hours integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT approval_workflow_steps_approver_type_check CHECK (((approver_type)::text = ANY ((ARRAY['role'::character varying, 'user'::character varying, 'position'::character varying])::text[])))
);


--
-- Name: approval_workflows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.approval_workflows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    document_type character varying NOT NULL,
    name character varying NOT NULL,
    amount_threshold_min numeric(15,2),
    amount_threshold_max numeric(15,2),
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ar_btbs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ar_btbs (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    ttf_id uuid NOT NULL,
    no_btb text DEFAULT ''::text NOT NULL,
    dpp_ppn numeric(18,2) DEFAULT 0 NOT NULL,
    pph numeric(18,2) DEFAULT 0 NOT NULL,
    payment numeric(18,2) DEFAULT 0 NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE ar_btbs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.ar_btbs IS 'AR Tracker BTB line items. Child of ar_ttfs (ON DELETE CASCADE). Update strategy: DELETE all rows for the TTF, then re-INSERT — never UPDATE individual BTB rows. Therefore no updated_at trigger needed.';


--
-- Name: COLUMN ar_btbs.dpp_ppn; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ar_btbs.dpp_ppn IS 'DPP (Dasar Pengenaan Pajak) + PPN combined amount.';


--
-- Name: COLUMN ar_btbs.pph; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ar_btbs.pph IS 'PPh (Pajak Penghasilan) withholding tax.';


--
-- Name: COLUMN ar_btbs."position"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ar_btbs."position" IS 'Sort order index. TTF detail display sorts by position ASC.';


--
-- Name: ar_ttfs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ar_ttfs (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    no_ttf text DEFAULT ''::text NOT NULL,
    tanggal_ttf date,
    tanggal_menerima date,
    no_inv text DEFAULT ''::text NOT NULL,
    no_sp text DEFAULT ''::text NOT NULL,
    customer_id uuid,
    tgl_pembayaran date,
    notes text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE ar_ttfs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.ar_ttfs IS 'AR Tracker TTF (Tanda Terima Faktur) headers. Parent of ar_btbs (cascade delete). tgl_pembayaran = NULL means unpaid; used for payment status calculation in calcAR().';


--
-- Name: COLUMN ar_ttfs.tgl_pembayaran; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ar_ttfs.tgl_pembayaran IS 'Payment receipt date. NULL = not yet paid. calcAR() in App.jsx uses this to determine status: Lunas / Partial / Belum Bayar.';


--
-- Name: asset_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.asset_categories (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    code character varying(20) NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    useful_life_years smallint,
    depreciation_method character varying(20) DEFAULT 'straight_line'::character varying NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT asset_categories_depreciation_method_check CHECK (((depreciation_method)::text = ANY ((ARRAY['straight_line'::character varying, 'double_declining'::character varying, 'none'::character varying])::text[]))),
    CONSTRAINT asset_categories_useful_life_years_check CHECK ((useful_life_years > 0))
);


--
-- Name: TABLE asset_categories; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.asset_categories IS 'P3 — Phase 4.2 only. Asset classification with depreciation parameters. Schema defined in Phase 1.0B for completeness.';


--
-- Name: COLUMN asset_categories.code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.asset_categories.code IS 'Category code, unique per company. e.g. IT-EQP, FURN, VEH, BLDG.';


--
-- Name: COLUMN asset_categories.useful_life_years; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.asset_categories.useful_life_years IS 'Expected useful life in years. Drives depreciation schedule calculation.';


--
-- Name: COLUMN asset_categories.depreciation_method; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.asset_categories.depreciation_method IS 'straight_line: equal annual depreciation. double_declining: accelerated. none: non-depreciable assets (land).';


--
-- Name: asset_fuel_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.asset_fuel_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    asset_id uuid NOT NULL,
    fill_date date NOT NULL,
    spbu character varying(150),
    liters numeric(8,2) NOT NULL,
    price_per_liter numeric(10,2) NOT NULL,
    total_cost numeric(12,2) GENERATED ALWAYS AS ((liters * price_per_liter)) STORED,
    odometer integer,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT asset_fuel_logs_liters_check CHECK ((liters > (0)::numeric)),
    CONSTRAINT asset_fuel_logs_price_per_liter_check CHECK ((price_per_liter > (0)::numeric))
);


--
-- Name: asset_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.asset_locations (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    code character varying(20) NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: TABLE asset_locations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.asset_locations IS 'P3 — Phase 4.2 only. Physical asset placement registry per branch. Schema defined in Phase 1.0B for completeness.';


--
-- Name: COLUMN asset_locations.branch_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.asset_locations.branch_id IS 'Branch where this location exists. Required — assets are always at a branch.';


--
-- Name: COLUMN asset_locations.code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.asset_locations.code IS 'Location code, unique per company. e.g. HO-IT-ROOM, HO-FIN-DESK.';


--
-- Name: asset_maintenance_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.asset_maintenance_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    asset_id uuid NOT NULL,
    company_id uuid NOT NULL,
    maintenance_date date NOT NULL,
    maintenance_type character varying(20) DEFAULT 'preventif'::character varying NOT NULL,
    description text,
    technician_name character varying(150),
    duration_minutes integer,
    cost numeric(14,2),
    status character varying(20) DEFAULT 'selesai'::character varying NOT NULL,
    next_scheduled_date date,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT asset_maintenance_records_maintenance_type_check CHECK (((maintenance_type)::text = ANY ((ARRAY['preventif'::character varying, 'korektif'::character varying, 'upgrade'::character varying, 'inspeksi'::character varying])::text[]))),
    CONSTRAINT asset_maintenance_records_status_check CHECK (((status)::text = ANY ((ARRAY['selesai'::character varying, 'dalam_proses'::character varying, 'dijadwalkan'::character varying, 'dibatalkan'::character varying])::text[])))
);


--
-- Name: asset_network; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.asset_network (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    asset_id uuid NOT NULL,
    company_id uuid NOT NULL,
    ip_address character varying(50),
    ipv6_address character varying(100),
    mac_wifi character varying(20),
    mac_lan character varying(20),
    hostname character varying(100),
    gateway character varying(50),
    dns_primary character varying(50),
    dns_secondary character varying(50),
    vlan character varying(50),
    domain_workgroup character varying(100),
    last_seen_at timestamp with time zone,
    is_online boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: asset_software_licenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.asset_software_licenses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    asset_id uuid NOT NULL,
    company_id uuid NOT NULL,
    software_name character varying(150) NOT NULL,
    version character varying(50),
    category character varying(50),
    license_type character varying(30) DEFAULT 'OEM'::character varying NOT NULL,
    license_key_masked character varying(100),
    expiry_date date,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT asset_software_licenses_license_type_check CHECK (((license_type)::text = ANY ((ARRAY['OEM'::character varying, 'Volume'::character varying, 'Subscription'::character varying, 'Open Source'::character varying, 'Freeware'::character varying, 'Trial'::character varying])::text[]))),
    CONSTRAINT asset_software_licenses_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'expired'::character varying, 'soon'::character varying, 'cancelled'::character varying])::text[])))
);


--
-- Name: asset_specifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.asset_specifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    asset_id uuid NOT NULL,
    company_id uuid NOT NULL,
    cpu_model character varying(150),
    cpu_cores smallint,
    cpu_threads smallint,
    cpu_base_ghz numeric(4,2),
    cpu_turbo_ghz numeric(4,2),
    cpu_cache_mb smallint,
    ram_gb smallint,
    ram_type character varying(20),
    ram_slots_used smallint,
    ram_slots_total smallint,
    storage_gb integer,
    storage_type character varying(20),
    storage_interface character varying(50),
    storage_used_pct smallint,
    display_size_inch numeric(4,1),
    display_resolution character varying(20),
    display_refresh_hz smallint,
    gpu_model character varying(100),
    os_name character varying(100),
    os_version character varying(50),
    os_build character varying(50),
    os_arch character varying(10),
    os_license_type character varying(30),
    battery_capacity_wh numeric(5,1),
    battery_health_pct smallint,
    battery_cycle_count integer,
    webcam_desc character varying(100),
    keyboard_desc character varying(100),
    ports_desc text,
    wireless_desc character varying(100),
    weight_kg numeric(4,2),
    color character varying(50),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT asset_specifications_storage_type_check CHECK (((storage_type)::text = ANY ((ARRAY['SSD'::character varying, 'HDD'::character varying, 'NVMe'::character varying, 'eMMC'::character varying, 'other'::character varying])::text[])))
);


--
-- Name: assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assets (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    asset_no character varying(50) NOT NULL,
    name character varying(150) NOT NULL,
    description text,
    category_id uuid NOT NULL,
    location_id uuid,
    purchase_date date,
    purchase_price numeric(18,2) DEFAULT 0,
    useful_life_years smallint,
    depreciation_method character varying(20),
    accumulated_depreciation numeric(18,2) DEFAULT 0 NOT NULL,
    book_value numeric(18,2) DEFAULT 0,
    status character varying(30) DEFAULT 'active'::character varying NOT NULL,
    assigned_to_user_id uuid,
    disposal_date date,
    disposal_notes text,
    coa_asset_account_id uuid,
    coa_depreciation_account_id uuid,
    coa_expense_account_id uuid,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    asset_code character varying(30),
    serial_number character varying(100),
    model character varying(150),
    asset_subtype character varying(20),
    assigned_to_name character varying(150),
    vendor_name character varying(150),
    purchase_invoice_no character varying(100),
    plate_number character varying(20),
    color character varying(50),
    manufacture_year smallint,
    fuel_type character varying(20),
    vin character varying(30),
    engine_number character varying(30),
    km_odometer integer DEFAULT 0,
    condition character varying,
    department_id uuid,
    brand character varying,
    assignment_status character varying DEFAULT 'available'::character varying,
    CONSTRAINT assets_asset_subtype_check CHECK (((asset_subtype)::text = ANY ((ARRAY['laptop'::character varying, 'desktop'::character varying, 'server'::character varying, 'printer'::character varying, 'network'::character varying, 'peripheral'::character varying, 'other'::character varying])::text[]))),
    CONSTRAINT assets_depreciation_method_check CHECK (((depreciation_method)::text = ANY ((ARRAY['straight_line'::character varying, 'double_declining'::character varying, 'none'::character varying])::text[]))),
    CONSTRAINT assets_fuel_type_check CHECK (((fuel_type)::text = ANY ((ARRAY['solar'::character varying, 'bensin'::character varying, 'pertamax'::character varying, 'pertalite'::character varying, 'listrik'::character varying, 'other'::character varying])::text[]))),
    CONSTRAINT assets_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'disposed'::character varying, 'in_repair'::character varying, 'retired'::character varying, 'transferred'::character varying])::text[])))
);


--
-- Name: TABLE assets; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.assets IS 'P3 — Phase 4.2 only. Fixed asset register. Disposal requires approval workflow — never hard delete. Schema defined in Phase 1.0B for completeness.';


--
-- Name: COLUMN assets.asset_no; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.assets.asset_no IS 'Document number in standard format: AST/{ENTITY}/{DEPT}/{YYYY}/{SEQ}. Generated via document_sequences.';


--
-- Name: COLUMN assets.useful_life_years; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.assets.useful_life_years IS 'Overrides the category default if set. Otherwise inherits from asset_categories.useful_life_years.';


--
-- Name: COLUMN assets.book_value; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.assets.book_value IS 'Current book value = purchase_price - accumulated_depreciation. Updated each depreciation run.';


--
-- Name: COLUMN assets.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.assets.status IS 'Asset lifecycle status: active, disposed, in_repair, retired, transferred.';


--
-- Name: COLUMN assets.coa_asset_account_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.assets.coa_asset_account_id IS 'Nullable FK to chart_of_accounts. Asset acquisition posting account. Set when COA is configured in Phase 3.';


--
-- Name: COLUMN assets.coa_depreciation_account_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.assets.coa_depreciation_account_id IS 'Nullable FK to chart_of_accounts. Accumulated depreciation contra-asset account.';


--
-- Name: COLUMN assets.coa_expense_account_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.assets.coa_expense_account_id IS 'Nullable FK to chart_of_accounts. Depreciation expense posting account.';


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid,
    user_email text,
    user_role text,
    company_id uuid,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid,
    entity_label text,
    old_data jsonb,
    new_data jsonb,
    ip_address text,
    user_agent text,
    notes text
);


--
-- Name: branches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.branches (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    code character varying(20) NOT NULL,
    name character varying(100) NOT NULL,
    address text,
    city character varying(100),
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: TABLE branches; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.branches IS 'Physical or operational locations of a company.';


--
-- Name: COLUMN branches.code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.branches.code IS 'Short location identifier, unique per company, e.g. HO, SBY, MDN.';


--
-- Name: COLUMN branches.deleted_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.branches.deleted_at IS 'Soft delete timestamp. NULL = active.';


--
-- Name: chart_of_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chart_of_accounts (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    code character varying(20) NOT NULL,
    name character varying(150) NOT NULL,
    account_type character varying(20) NOT NULL,
    parent_id uuid,
    level smallint DEFAULT 1 NOT NULL,
    is_header boolean DEFAULT false NOT NULL,
    normal_balance character varying(6) DEFAULT 'debit'::character varying NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT chart_of_accounts_account_type_check CHECK (((account_type)::text = ANY ((ARRAY['asset'::character varying, 'liability'::character varying, 'equity'::character varying, 'revenue'::character varying, 'expense'::character varying])::text[]))),
    CONSTRAINT chart_of_accounts_level_check CHECK (((level >= 1) AND (level <= 4))),
    CONSTRAINT chart_of_accounts_normal_balance_check CHECK (((normal_balance)::text = ANY ((ARRAY['debit'::character varying, 'credit'::character varying])::text[])))
);


--
-- Name: TABLE chart_of_accounts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.chart_of_accounts IS 'Company-scoped general ledger account structure. Finance Controller must approve before any accounting transaction is recorded.';


--
-- Name: COLUMN chart_of_accounts.code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.chart_of_accounts.code IS 'Account code, unique per company. Follows Indonesian standard COA numbering convention.';


--
-- Name: COLUMN chart_of_accounts.account_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.chart_of_accounts.account_type IS 'Fundamental account classification: asset, liability, equity, revenue, expense.';


--
-- Name: COLUMN chart_of_accounts.parent_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.chart_of_accounts.parent_id IS 'Self-referential parent for hierarchy. NULL = top-level account type grouping.';


--
-- Name: COLUMN chart_of_accounts.level; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.chart_of_accounts.level IS '1=Type, 2=Group, 3=Sub-Group, 4=Detail. Only level 4 (leaf) accounts accept direct postings.';


--
-- Name: COLUMN chart_of_accounts.is_header; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.chart_of_accounts.is_header IS 'True = summary/header account. Direct journal postings to header accounts are not allowed.';


--
-- Name: COLUMN chart_of_accounts.normal_balance; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.chart_of_accounts.normal_balance IS 'debit: increases with debit entries (assets, expenses). credit: increases with credit entries (liabilities, equity, revenue).';


--
-- Name: COLUMN chart_of_accounts.deleted_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.chart_of_accounts.deleted_at IS 'Soft delete only if no transactions reference this account. Finance Controller approval required before deleting any account.';


--
-- Name: code_counters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.code_counters (
    entity text NOT NULL,
    year integer NOT NULL,
    last_number integer DEFAULT 0 NOT NULL
);


--
-- Name: companies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.companies (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    code character varying(20) NOT NULL,
    name character varying(100) NOT NULL,
    legal_name character varying(200),
    business_focus character varying(100),
    address text,
    city character varying(100),
    country character varying(100) DEFAULT 'Indonesia'::character varying,
    phone character varying(50),
    email character varying(100),
    tax_id character varying(50),
    logo_url text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    nib character varying,
    website character varying,
    address_2 character varying,
    province character varying,
    postal_code character varying,
    fiscal_year_start integer DEFAULT 1,
    default_currency character varying(3) DEFAULT 'IDR'::character varying,
    timezone character varying DEFAULT 'Asia/Jakarta'::character varying,
    aging_enabled boolean DEFAULT false NOT NULL
);


--
-- Name: TABLE companies; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.companies IS 'Root anchor for all company-scoped data. One row per MSI Group legal entity.';


--
-- Name: COLUMN companies.code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.companies.code IS 'Short identifier: MSI, JCI, SBI. Used as the {ENTITY} segment in document numbers.';


--
-- Name: COLUMN companies.business_focus; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.companies.business_focus IS 'Human-readable description: Freight Forwarding, PPJK, General Trading.';


--
-- Name: COLUMN companies.tax_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.companies.tax_id IS 'NPWP — Indonesian tax registration number.';


--
-- Name: cost_centers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cost_centers (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    branch_id uuid,
    department_id uuid,
    code character varying(20) NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: TABLE cost_centers; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.cost_centers IS 'Company-scoped budget and cost tracking units. Used in job costing, expense allocation, and management reporting.';


--
-- Name: COLUMN cost_centers.branch_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cost_centers.branch_id IS 'Optional branch association. NULL = cost center spans all branches.';


--
-- Name: COLUMN cost_centers.department_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cost_centers.department_id IS 'Optional department association. NULL = cost center spans all departments.';


--
-- Name: COLUMN cost_centers.code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cost_centers.code IS 'Cost center code, unique per company. e.g. CC-LOG-HO, CC-SLS-SBY.';


--
-- Name: currencies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.currencies (
    code character varying(3) NOT NULL,
    name character varying(100) NOT NULL,
    symbol character varying(10),
    decimal_places smallint DEFAULT 2 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE currencies; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.currencies IS 'Global ISO 4217 currency registry. Readable by all authenticated users; managed by Super Admin only.';


--
-- Name: COLUMN currencies.code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.currencies.code IS 'ISO 4217 three-letter currency code: IDR, USD, SGD, EUR, JPY.';


--
-- Name: COLUMN currencies.decimal_places; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.currencies.decimal_places IS 'Number of decimal places for display. IDR = 0, USD/EUR/SGD = 2, JPY = 0.';


--
-- Name: customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customers (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    code text,
    default_dc text DEFAULT ''::text NOT NULL,
    pic_name text DEFAULT ''::text NOT NULL,
    pic_email text DEFAULT ''::text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    payment_terms integer DEFAULT 30 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    company_id uuid NOT NULL,
    legal_name character varying(200),
    customer_type character varying(50),
    tax_id character varying(50),
    address text,
    city character varying(100),
    country character varying(100) DEFAULT 'Indonesia'::character varying,
    phone character varying(50),
    email character varying(100),
    pic_phone character varying(50),
    credit_limit numeric(18,2) DEFAULT 0,
    payment_terms_id uuid,
    currency_code character varying(3) DEFAULT 'IDR'::character varying,
    notes text,
    deleted_at timestamp with time zone,
    created_by uuid,
    updated_by uuid,
    nomor_kontrak text,
    status character varying(50) DEFAULT 'active'::character varying,
    prospect_id uuid,
    assigned_to uuid,
    tier character varying(20),
    last_activity_at timestamp with time zone DEFAULT now(),
    source_company_id uuid
);


--
-- Name: TABLE customers; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.customers IS 'Legacy customer master table. Used by Customer page, SP Manifest, and AR Tracker. Extended by migration 008 with ERP fields (company_id, credit_limit, etc.). payment_terms (integer days) is the legacy field; payment_terms_id FK added in 008.';


--
-- Name: COLUMN customers.code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.customers.code IS 'Customer code, unique per company. Auto-generated or manually assigned. e.g. CST-0001.';


--
-- Name: COLUMN customers.payment_terms; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.customers.payment_terms IS 'Legacy payment terms in days (integer). Not used by current customerFromDb() but preserved as a pre-existing column. Migration 008 adds payment_terms_id (FK). Phase 1.0F migrates this value to the FK and drops this integer column.';


--
-- Name: COLUMN customers.company_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.customers.company_id IS 'ERP company scope. NULL until Phase 1.0F backfill. Will become NOT NULL after 1.0F.';


--
-- Name: COLUMN customers.customer_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.customers.customer_type IS 'Customer classification: Individual, Company, Government, Freight Agent, etc.';


--
-- Name: COLUMN customers.tax_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.customers.tax_id IS 'NPWP (Indonesian tax ID) or equivalent for non-Indonesian customers.';


--
-- Name: COLUMN customers.credit_limit; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.customers.credit_limit IS 'Maximum outstanding AR allowed. Sensitive — mask in non-Finance role views.';


--
-- Name: COLUMN customers.payment_terms_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.customers.payment_terms_id IS 'FK to payment_terms. New ERP field running alongside legacy payment_terms (integer). Phase 1.0F migrates and removes the integer.';


--
-- Name: COLUMN customers.currency_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.customers.currency_code IS 'Default billing currency for this customer. Default IDR.';


--
-- Name: COLUMN customers.deleted_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.customers.deleted_at IS 'Soft delete timestamp. NULL = active. If column already exists, ADD IF NOT EXISTS is safe.';


--
-- Name: COLUMN customers.updated_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.customers.updated_by IS 'User who last updated this record.';


--
-- Name: dc_master; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dc_master (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    customer_id uuid,
    kode text,
    nama text NOT NULL,
    wilayah text,
    alamat text,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT dc_master_wilayah_check CHECK ((wilayah = ANY (ARRAY['Jawa'::text, 'Sumatera'::text, 'Sulawesi'::text, 'Kalimantan'::text, 'Bali & Nusa Tenggara'::text, 'Lainnya'::text])))
);


--
-- Name: deal_handovers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deal_handovers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    account_id uuid,
    handover_type text NOT NULL,
    nama_perusahaan text,
    npwp text,
    nib text,
    ktp_direktur text,
    alamat text,
    website text,
    industri text,
    tahun_berdiri text,
    tipe_customer text,
    tier_assigned text,
    stream_service text,
    estimasi_volume text,
    payment_terms text,
    credit_limit numeric(18,2),
    validity_quote text,
    special_handling text,
    tcv_forecast numeric(18,2),
    volume_per_lane text,
    service_mix text,
    sla_komitmen text,
    quotation_ref text,
    msa_status text,
    pic_decision_maker text,
    pic_operasional text,
    pic_commercial text,
    pic_finance text,
    pic_escalation_1 text,
    pic_escalation_2 text,
    top_approved text,
    pefindo_score text,
    bank_reference text,
    invoicing_instructions text,
    tax_status text,
    doc_requirement text,
    communication_pref text,
    reporting_cadence text,
    kam_assigned uuid,
    status text DEFAULT 'draft'::text,
    submitted_at timestamp with time zone,
    approved_by_sales uuid,
    approved_by_ops uuid,
    approved_by_finance uuid,
    approved_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT deal_handovers_handover_type_check CHECK ((handover_type = ANY (ARRAY['light'::text, 'strategic'::text]))),
    CONSTRAINT deal_handovers_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'submitted'::text, 'approved'::text])))
);


--
-- Name: delivery_note_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.delivery_note_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    delivery_note_id uuid NOT NULL,
    picking_list_item_id uuid,
    product_name text DEFAULT ''::text NOT NULL,
    sku text DEFAULT ''::text NOT NULL,
    qty integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    product_id uuid,
    sp_order_item_id uuid
);


--
-- Name: delivery_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.delivery_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid DEFAULT 'd2e5e565-5f67-4954-b8d9-5979a2a0c697'::uuid NOT NULL,
    do_no text NOT NULL,
    sp_no text NOT NULL,
    picking_list_id uuid,
    customer_id uuid,
    destination_address text,
    driver_name text,
    driver_phone text,
    vehicle_no text,
    ship_date date,
    total_koli integer,
    total_weight numeric(12,2),
    status text DEFAULT 'draft'::text NOT NULL,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    dispatched_at timestamp with time zone,
    delivered_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    customer_name text,
    sp_order_id uuid,
    CONSTRAINT delivery_notes_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'in_transit'::text, 'delivered'::text, 'cancelled'::text])))
);


--
-- Name: departments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.departments (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    code character varying(20) NOT NULL,
    name character varying(100) NOT NULL,
    parent_id uuid,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: TABLE departments; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.departments IS 'Organizational units. Codes appear as the {DEPT} segment in document numbers.';


--
-- Name: COLUMN departments.code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.departments.code IS 'Short dept code matching the Document Numbering standard: SLS, LOG, FIN, PROC, IT, MGMT, HR.';


--
-- Name: COLUMN departments.parent_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.departments.parent_id IS 'Self-referential parent department for hierarchy. NULL = top-level.';


--
-- Name: COLUMN departments.deleted_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.departments.deleted_at IS 'Soft delete timestamp. NULL = active.';


--
-- Name: document_numbering; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_numbering (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    document_type character varying NOT NULL,
    prefix character varying DEFAULT ''::character varying NOT NULL,
    suffix character varying DEFAULT ''::character varying NOT NULL,
    padding_digits integer DEFAULT 4 NOT NULL,
    separator character varying DEFAULT '/'::character varying NOT NULL,
    reset_cadence character varying DEFAULT 'yearly'::character varying NOT NULL,
    last_sequence integer DEFAULT 0 NOT NULL,
    last_reset_at timestamp with time zone,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT document_numbering_reset_cadence_check CHECK (((reset_cadence)::text = ANY ((ARRAY['yearly'::character varying, 'monthly'::character varying, 'never'::character varying])::text[])))
);


--
-- Name: document_sequences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_sequences (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    document_type character varying(20) NOT NULL,
    department_code character varying(20) NOT NULL,
    year smallint NOT NULL,
    month smallint DEFAULT 0 NOT NULL,
    last_sequence integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE document_sequences; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.document_sequences IS 'Running sequence counter per (company, document_type, department_code, year, month). Incremented atomically via UPDATE ... RETURNING. See docs/workflow/document-numbering.md.';


--
-- Name: COLUMN document_sequences.month; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.document_sequences.month IS '0 = yearly reset (most common). 1–12 = monthly reset. Matches reset_period in document_types.';


--
-- Name: COLUMN document_sequences.last_sequence; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.document_sequences.last_sequence IS 'The last assigned sequence number. Increment atomically: UPDATE ... SET last_sequence = last_sequence + 1 ... RETURNING last_sequence. Never SELECT then UPDATE.';


--
-- Name: document_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    document_type character varying NOT NULL,
    header_text text,
    footer_text text,
    terms_and_conditions text,
    footnote text,
    logo_position character varying DEFAULT 'left'::character varying NOT NULL,
    show_stamp boolean DEFAULT true NOT NULL,
    show_signature boolean DEFAULT true NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT document_templates_logo_position_check CHECK (((logo_position)::text = ANY ((ARRAY['left'::character varying, 'center'::character varying, 'right'::character varying])::text[])))
);


--
-- Name: document_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_types (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    module character varying(50) NOT NULL,
    code character varying(20) NOT NULL,
    name character varying(100) NOT NULL,
    prefix_format character varying(100) DEFAULT '{DOC}/{ENTITY}/{DEPT}/{YYYY}/{SEQ}'::character varying NOT NULL,
    department_code character varying(20) NOT NULL,
    reset_period character varying(10) DEFAULT 'yearly'::character varying NOT NULL,
    seq_padding smallint DEFAULT 4 NOT NULL,
    approval_required boolean DEFAULT true NOT NULL,
    notes text,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT document_types_reset_period_check CHECK (((reset_period)::text = ANY ((ARRAY['yearly'::character varying, 'monthly'::character varying])::text[])))
);


--
-- Name: TABLE document_types; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.document_types IS 'Document type registry per company. Defines numbering format, approval requirement, and department segment for each document code.';


--
-- Name: COLUMN document_types.code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.document_types.code IS 'Short document code: QT, SP, SHP, CUS, TRD, PR, PO, GRN, INV, RCP, PV, JE, AST, TCK, HRG.';


--
-- Name: COLUMN document_types.prefix_format; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.document_types.prefix_format IS 'Numbering format template. Supported tokens: {DOC}, {ENTITY}, {DEPT}, {YYYY}, {MM}, {SEQ}.';


--
-- Name: COLUMN document_types.department_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.document_types.department_code IS 'Default department code used in the document number segment. Stored as varchar — NOT a FK to departments. See docs/workflow/document-numbering.md.';


--
-- Name: COLUMN document_types.reset_period; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.document_types.reset_period IS 'Sequence reset period: yearly (most common) or monthly.';


--
-- Name: COLUMN document_types.seq_padding; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.document_types.seq_padding IS 'Zero-padding width for the sequence segment. Default 4 produces 0001, 0042, 1234.';


--
-- Name: dropdown_options; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dropdown_options (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_key text NOT NULL,
    list_key text NOT NULL,
    label text NOT NULL,
    value text NOT NULL,
    sort_order smallint DEFAULT 0,
    is_active boolean DEFAULT true,
    company_id uuid,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: entity_bank_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entity_bank_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    bank_name character varying NOT NULL,
    account_number character varying NOT NULL,
    account_holder character varying NOT NULL,
    branch character varying,
    currency character varying(3) DEFAULT 'IDR'::character varying NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: entity_finance_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entity_finance_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    ppn_rate numeric(5,2) DEFAULT 11.00 NOT NULL,
    ppn_formula character varying DEFAULT 'opsi_b'::character varying NOT NULL,
    pph_rate numeric(5,2) DEFAULT 0.00 NOT NULL,
    tax_mode character varying DEFAULT 'exclusive'::character varying NOT NULL,
    base_currency character varying(3) DEFAULT 'IDR'::character varying NOT NULL,
    supported_currencies text[] DEFAULT '{IDR}'::text[] NOT NULL,
    rate_input_mode character varying DEFAULT 'manual'::character varying NOT NULL,
    default_payment_terms integer DEFAULT 30 NOT NULL,
    quotation_validity_days integer DEFAULT 14 NOT NULL,
    default_incoterm character varying,
    rounding_mode character varying DEFAULT 'round'::character varying NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT entity_finance_settings_ppn_formula_check CHECK (((ppn_formula)::text = ANY ((ARRAY['opsi_a'::character varying, 'opsi_b'::character varying])::text[]))),
    CONSTRAINT entity_finance_settings_rate_input_mode_check CHECK (((rate_input_mode)::text = ANY ((ARRAY['manual'::character varying, 'daily'::character varying])::text[]))),
    CONSTRAINT entity_finance_settings_rounding_mode_check CHECK (((rounding_mode)::text = ANY ((ARRAY['round'::character varying, 'floor'::character varying, 'ceil'::character varying])::text[]))),
    CONSTRAINT entity_finance_settings_tax_mode_check CHECK (((tax_mode)::text = ANY ((ARRAY['inclusive'::character varying, 'exclusive'::character varying])::text[])))
);


--
-- Name: entity_signatories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entity_signatories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    name character varying NOT NULL,
    title character varying NOT NULL,
    document_types text[] DEFAULT '{}'::text[] NOT NULL,
    signature_url text,
    stamp_url text,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: exchange_rates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exchange_rates (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    from_currency character varying(3) NOT NULL,
    to_currency character varying(3) NOT NULL,
    rate numeric(18,6) NOT NULL,
    effective_date date NOT NULL,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT exchange_rates_no_self_conversion CHECK (((from_currency)::text <> (to_currency)::text)),
    CONSTRAINT exchange_rates_rate_check CHECK ((rate > (0)::numeric))
);


--
-- Name: TABLE exchange_rates; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.exchange_rates IS 'Company-scoped exchange rate history. Never delete historical rates — deactivate via effective_date or add a new rate.';


--
-- Name: COLUMN exchange_rates.rate; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.exchange_rates.rate IS 'Rate: 1 unit of from_currency = rate units of to_currency. Must be > 0.';


--
-- Name: COLUMN exchange_rates.effective_date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.exchange_rates.effective_date IS 'The date from which this rate is valid. Use most recent rate on or before the transaction date.';


--
-- Name: hrga_approval_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hrga_approval_configs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    request_type_id uuid NOT NULL,
    level integer NOT NULL,
    approver_role character varying(50) NOT NULL,
    approver_user_id uuid,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT hrga_approval_configs_level_check CHECK (((level >= 1) AND (level <= 3)))
);


--
-- Name: hrga_notification_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hrga_notification_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    request_id uuid NOT NULL,
    recipient_id uuid NOT NULL,
    recipient_email character varying(200) NOT NULL,
    notification_type character varying(50) NOT NULL,
    payload jsonb,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    sent_at timestamp with time zone,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT hrga_notification_queue_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'sent'::character varying, 'failed'::character varying, 'skipped'::character varying])::text[]))),
    CONSTRAINT hrga_notification_queue_type_check CHECK (((notification_type)::text = ANY ((ARRAY['request_submitted'::character varying, 'request_approved'::character varying, 'request_rejected'::character varying, 'approval_pending'::character varying, 'revision_requested'::character varying])::text[])))
);


--
-- Name: hrga_offboarding_checklists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hrga_offboarding_checklists (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    department character varying(50) DEFAULT 'ALL'::character varying NOT NULL,
    responsible_role character varying(50) NOT NULL,
    item_order integer DEFAULT 0 NOT NULL,
    item_description character varying(300) NOT NULL,
    is_required boolean DEFAULT true NOT NULL,
    notes text,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT hrga_offboarding_checklists_role_check CHECK (((responsible_role)::text = ANY ((ARRAY['hrga'::character varying, 'it'::character varying, 'finance'::character varying, 'supervisor'::character varying])::text[])))
);


--
-- Name: hrga_offboarding_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hrga_offboarding_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_id uuid NOT NULL,
    checklist_id uuid,
    item_order integer DEFAULT 0 NOT NULL,
    item_description character varying(300) NOT NULL,
    responsible_role character varying(50) NOT NULL,
    is_required boolean DEFAULT true NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    completed_by uuid,
    completed_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT hrga_offboarding_items_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'done'::character varying, 'skipped'::character varying, 'na'::character varying])::text[])))
);


--
-- Name: hrga_request_approvals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hrga_request_approvals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_id uuid NOT NULL,
    level integer NOT NULL,
    approver_id uuid NOT NULL,
    approver_role character varying(50) NOT NULL,
    action character varying(30) NOT NULL,
    comment text,
    actioned_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT hrga_request_approvals_action_check CHECK (((action)::text = ANY ((ARRAY['approved'::character varying, 'rejected'::character varying, 'revision_requested'::character varying, 'noted'::character varying])::text[]))),
    CONSTRAINT hrga_request_approvals_level_check CHECK (((level >= 1) AND (level <= 3)))
);


--
-- Name: hrga_request_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hrga_request_attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_id uuid NOT NULL,
    file_name character varying(255) NOT NULL,
    storage_path text NOT NULL,
    file_size_bytes bigint,
    mime_type character varying(100),
    uploaded_by uuid NOT NULL,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: hrga_request_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hrga_request_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_id uuid NOT NULL,
    line_no integer DEFAULT 1 NOT NULL,
    item_description character varying(300) NOT NULL,
    quantity numeric(18,4) DEFAULT 1 NOT NULL,
    unit character varying(50),
    unit_price numeric(18,4),
    total_price numeric(18,4),
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT hrga_request_items_line_no_positive CHECK ((line_no > 0)),
    CONSTRAINT hrga_request_items_qty_positive CHECK ((quantity > (0)::numeric))
);


--
-- Name: hrga_request_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hrga_request_types (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    category_code character varying(10) NOT NULL,
    category_name character varying(100) NOT NULL,
    type_code character varying(30) NOT NULL,
    type_name character varying(150) NOT NULL,
    description text,
    requires_attachment boolean DEFAULT false NOT NULL,
    requires_amount boolean DEFAULT false NOT NULL,
    requires_date_range boolean DEFAULT false NOT NULL,
    approval_levels integer DEFAULT 1 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT hrga_request_types_approval_levels_check CHECK (((approval_levels >= 1) AND (approval_levels <= 3))),
    CONSTRAINT hrga_request_types_category_check CHECK (((category_code)::text = ANY ((ARRAY['ADM'::character varying, 'AST'::character varying, 'FAC'::character varying, 'TRV'::character varying, 'FIN'::character varying, 'OFF'::character varying])::text[])))
);


--
-- Name: hrga_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hrga_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    document_no character varying(50) NOT NULL,
    request_type_id uuid NOT NULL,
    requester_id uuid NOT NULL,
    department_id uuid,
    branch_id uuid,
    subject character varying(300) NOT NULL,
    description text,
    requested_date date,
    start_date date,
    end_date date,
    amount numeric(18,4),
    currency_code character varying(3) DEFAULT 'IDR'::character varying,
    destination character varying(200),
    notes text,
    status character varying(30) DEFAULT 'draft'::character varying NOT NULL,
    current_level integer DEFAULT 0 NOT NULL,
    total_levels integer DEFAULT 1 NOT NULL,
    submitted_at timestamp with time zone,
    approved_at timestamp with time zone,
    rejected_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT hrga_requests_status_check CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'submitted'::character varying, 'under_review'::character varying, 'revision_requested'::character varying, 'revised'::character varying, 'approved'::character varying, 'rejected'::character varying, 'cancelled'::character varying, 'completed'::character varying, 'archived'::character varying])::text[]))),
    CONSTRAINT hrga_requests_total_levels_check CHECK (((total_levels >= 1) AND (total_levels <= 3)))
);


--
-- Name: inquiries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inquiries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    inquiry_no text NOT NULL,
    prospect_id uuid,
    customer_id uuid,
    service_type character varying,
    route text,
    commodity text,
    estimated_volume text,
    notes text,
    status character varying DEFAULT 'OPEN'::character varying,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone,
    deadline_quote date,
    pol text,
    pod text,
    incoterms text[],
    container_types text[],
    goods_name text,
    hs_code text,
    weight_kg numeric(12,2),
    volume_cbm numeric(12,2),
    cargo_types text[],
    un_number text,
    imo_class text,
    has_msds text,
    additional_services text[],
    dimension text,
    pickup_address text,
    delivery_address text,
    won_reason text,
    lost_reason text,
    estimated_value numeric,
    CONSTRAINT inquiries_status_check CHECK (((status)::text = ANY ((ARRAY['OPEN'::character varying, 'IN_REVIEW'::character varying, 'QUOTED'::character varying, 'NEGOTIATION'::character varying, 'WON'::character varying, 'LOST'::character varying, 'CANCELLED'::character varying])::text[])))
);


--
-- Name: inquiries_status_backup_20260722; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inquiries_status_backup_20260722 (
    id uuid,
    status character varying,
    updated_at timestamp with time zone
);


--
-- Name: meeting_moms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meeting_moms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    mom_no text,
    mom_type text NOT NULL,
    divisi text,
    meeting_date date,
    time_start time without time zone,
    time_end time without time zone,
    pemimpin text,
    notulis_id uuid,
    lokasi text,
    peserta text[],
    catatan_tambahan text,
    status text DEFAULT 'draft'::text,
    submitted_at timestamp with time zone,
    approved_by uuid,
    approved_at timestamp with time zone,
    reject_reason text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT meeting_moms_mom_type_check CHECK ((mom_type = ANY (ARRAY['weekly'::text, 'project'::text, 'probation'::text, 'board'::text, 'departmental'::text, 'adhoc'::text]))),
    CONSTRAINT meeting_moms_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'submitted'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: menu_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.menu_actions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    menu_id uuid NOT NULL,
    action text NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: module_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.module_actions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    module_id uuid NOT NULL,
    action text NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: module_menus; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.module_menus (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    module_id uuid NOT NULL,
    key text NOT NULL,
    label text NOT NULL,
    sort_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: modules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.modules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    label text NOT NULL,
    sort_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: mom_action_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mom_action_plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    mom_id uuid,
    section text NOT NULL,
    no smallint,
    action_plan text,
    pic text,
    timeline date,
    prioritas text,
    status text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT mom_action_plans_prioritas_check CHECK ((prioritas = ANY (ARRAY['high'::text, 'medium'::text, 'low'::text]))),
    CONSTRAINT mom_action_plans_section_check CHECK ((section = ANY (ARRAY['review'::text, 'new'::text]))),
    CONSTRAINT mom_action_plans_status_check CHECK ((status = ANY (ARRAY['done'::text, 'on_progress'::text, 'pending'::text, 'high_priority'::text, 'new_initiative'::text, 'appreciated'::text, 'positive'::text, 'need_improvement'::text])))
);


--
-- Name: mom_improvements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mom_improvements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    mom_id uuid,
    no smallint,
    usulan text,
    catatan text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: mom_issues; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mom_issues (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    mom_id uuid,
    no smallint,
    issue text,
    dampak text,
    akar_masalah text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: mom_progress_updates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mom_progress_updates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    mom_id uuid,
    no smallint,
    aspek text,
    capaian text,
    target text,
    status text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: notification_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    event_type character varying NOT NULL,
    event_scope character varying,
    channel character varying DEFAULT 'in_app'::character varying NOT NULL,
    recipient_type character varying DEFAULT 'role'::character varying NOT NULL,
    recipient_role character varying,
    recipient_user_id uuid,
    template_subject character varying,
    template_body text,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notification_rules_channel_check CHECK (((channel)::text = ANY ((ARRAY['in_app'::character varying, 'email'::character varying, 'both'::character varying])::text[]))),
    CONSTRAINT notification_rules_recipient_type_check CHECK (((recipient_type)::text = ANY ((ARRAY['role'::character varying, 'user'::character varying, 'assigned_to'::character varying, 'created_by'::character varying])::text[])))
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    user_id uuid NOT NULL,
    event_type character varying NOT NULL,
    title character varying NOT NULL,
    body text,
    reference_type character varying,
    reference_id uuid,
    is_read boolean DEFAULT false NOT NULL,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: payment_terms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_terms (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    code character varying(20) NOT NULL,
    name character varying(100) NOT NULL,
    days_due integer DEFAULT 0 NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT payment_terms_days_due_check CHECK ((days_due >= 0))
);


--
-- Name: TABLE payment_terms; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.payment_terms IS 'Company-scoped payment term templates. Standardizes due-date calculation for customers, vendors, and invoices.';


--
-- Name: COLUMN payment_terms.days_due; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.payment_terms.days_due IS 'Number of days from invoice date until payment is due. 0 = COD (cash on delivery).';


--
-- Name: permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permissions (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    module character varying(50) NOT NULL,
    action character varying(50) NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE permissions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.permissions IS 'Global permission catalog. Every {module}.{action} combination that can be granted to a role. Managed by Super Admin only.';


--
-- Name: COLUMN permissions.module; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.permissions.module IS 'Module slug, e.g. companies, customers, sales_orders, invoices, users.';


--
-- Name: COLUMN permissions.action; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.permissions.action IS 'Action code: view, create, edit, delete, restore, approve, submit, export, import, print, config.';


--
-- Name: picking_list_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.picking_list_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    picking_list_id uuid NOT NULL,
    sp_item_id uuid,
    product_id uuid,
    product_name text DEFAULT ''::text NOT NULL,
    sku text DEFAULT ''::text NOT NULL,
    qty_requested integer DEFAULT 0 NOT NULL,
    qty_picked integer DEFAULT 0 NOT NULL,
    location_detail text,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    qty_short integer DEFAULT 0 NOT NULL,
    CONSTRAINT picking_list_items_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'picked'::text, 'short'::text])))
);


--
-- Name: picking_list_materials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.picking_list_materials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    picking_list_id uuid NOT NULL,
    product_id uuid NOT NULL,
    product_name text DEFAULT ''::text NOT NULL,
    sku text DEFAULT ''::text NOT NULL,
    qty integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid
);


--
-- Name: picking_lists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.picking_lists (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid DEFAULT 'd2e5e565-5f67-4954-b8d9-5979a2a0c697'::uuid NOT NULL,
    picking_no text NOT NULL,
    sp_no text NOT NULL,
    warehouse_id uuid,
    assigned_to uuid,
    status text DEFAULT 'pending'::text NOT NULL,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    sp_order_id uuid,
    customer_id uuid,
    CONSTRAINT picking_lists_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'done'::text, 'cancelled'::text])))
);


--
-- Name: positions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.positions (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    department_id uuid,
    code character varying(20) NOT NULL,
    name character varying(100) NOT NULL,
    level character varying(20) DEFAULT 'Staff'::character varying NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT positions_level_check CHECK (((level)::text = ANY ((ARRAY['Staff'::character varying, 'Supervisor'::character varying, 'Manager'::character varying, 'Head'::character varying, 'Director'::character varying])::text[])))
);


--
-- Name: TABLE positions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.positions IS 'Company-scoped job position registry. Levels drive approval matrix thresholds.';


--
-- Name: COLUMN positions.department_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.positions.department_id IS 'Optional department assignment. NULL = position spans multiple departments.';


--
-- Name: COLUMN positions.code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.positions.code IS 'Position code, unique per company. e.g. STAFF, SPV, MGR, HEAD, DIR.';


--
-- Name: COLUMN positions.level; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.positions.level IS 'Seniority level: Staff, Supervisor, Manager, Head, Director. Used for approval threshold matching.';


--
-- Name: prf; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prf (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    prf_no text NOT NULL,
    status character varying DEFAULT 'DRAFT'::character varying,
    created_by uuid,
    updated_by uuid,
    submitted_at timestamp with time zone,
    acknowledged_by uuid,
    acknowledged_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone,
    customer_source text,
    account_id uuid,
    account_name_manual text,
    stream text,
    deadline_quotation date,
    direction text,
    commodity text,
    hs_code text,
    msds_available boolean DEFAULT false,
    service_type text,
    incoterms text,
    commercial_value numeric(14,2),
    commercial_currency text,
    origin text,
    destination text,
    pickup_address text,
    delivery_address text,
    add_on_services text[],
    add_on_others text,
    cargo_ready_date date,
    sea_freight_type text,
    sea_container_types text[],
    sea_container_qty jsonb,
    sea_lcl_gw numeric(12,2),
    sea_lcl_dimension text,
    sea_lcl_volume numeric(12,2),
    sea_lcl_koli integer,
    air_gw numeric(12,2),
    air_dimension text,
    air_volume numeric(12,2),
    air_koli integer,
    inland_fleet_types text[],
    inland_pickup_address text,
    inland_delivery_address text,
    inland_gw numeric(12,2),
    inland_dimension text,
    custom_doc_type text,
    project_freight_types text[],
    project_qty integer,
    notes text,
    inquiry_id uuid,
    suggested_rate numeric(18,2),
    rate_currency text DEFAULT 'IDR'::text NOT NULL,
    valid_from date,
    valid_until date,
    pricing_notes text,
    answered_by uuid,
    answered_at timestamp with time zone,
    exchange_rates jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT prf_status_check CHECK (((status)::text = ANY (ARRAY['DRAFT'::text, 'SUBMITTED'::text, 'ACKNOWLEDGED'::text, 'CANCELLED'::text, 'QUOTED'::text, 'EXPIRED'::text])))
);


--
-- Name: prf_cost_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prf_cost_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    prf_id uuid NOT NULL,
    component text NOT NULL,
    cost_type text DEFAULT 'vendor'::text NOT NULL,
    amount numeric(18,2) DEFAULT 0 NOT NULL,
    currency text DEFAULT 'IDR'::text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    vendor_id uuid,
    item_group text,
    is_awarded boolean DEFAULT true NOT NULL,
    exchange_rate numeric DEFAULT 1 NOT NULL,
    CONSTRAINT prf_cost_items_cost_type_check CHECK ((cost_type = ANY (ARRAY['vendor'::text, 'internal'::text])))
);


--
-- Name: product_price_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_price_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    company_id uuid NOT NULL,
    old_price numeric(18,2),
    new_price numeric(18,2),
    changed_by uuid,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    reason text,
    source text,
    contract_no text,
    valid_from date,
    valid_until date,
    price_category text
);


--
-- Name: product_warehouse_location; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_warehouse_location (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    product_id uuid NOT NULL,
    warehouse_id uuid NOT NULL,
    rack_location text,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    code character varying(20) NOT NULL,
    name character varying(100) NOT NULL,
    category character varying(50),
    unit character varying(20),
    description text,
    is_service boolean DEFAULT true NOT NULL,
    default_price numeric(18,2) DEFAULT 0,
    tax_id uuid,
    cogs_account_id uuid,
    revenue_account_id uuid,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    registered_date date,
    inventory_class character varying(100),
    main_group character varying(100),
    operational_function text,
    uom text,
    unit_cost numeric(15,2),
    weight text,
    dimensions text,
    packaging text,
    min_order_qty text,
    cogs_account text,
    revenue_account text,
    price_semester numeric(18,2),
    price_tahunan numeric(18,2),
    price_project numeric(18,2)
);


--
-- Name: TABLE products; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.products IS 'Company-scoped product and service catalog. Used in quotations, sales orders, invoices, and purchase orders.';


--
-- Name: COLUMN products.code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.code IS 'Product/service code, unique per company. e.g. SRV-0001 for services, PRD-0001 for goods.';


--
-- Name: COLUMN products.is_service; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.is_service IS 'True = billable service (most MSI/JCI items). False = physical goods (SBI trading).';


--
-- Name: COLUMN products.default_price; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.default_price IS 'Default unit price. Overridable at transaction level.';


--
-- Name: COLUMN products.cogs_account_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.cogs_account_id IS 'Nullable FK to chart_of_accounts for COGS mapping. Set in Phase 3 when COA is configured.';


--
-- Name: COLUMN products.revenue_account_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.revenue_account_id IS 'Nullable FK to chart_of_accounts for revenue mapping. Set in Phase 3 when COA is configured.';


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    full_name text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    company_id uuid NOT NULL,
    branch_id uuid,
    department_id uuid,
    position_id uuid,
    last_login_at timestamp with time zone,
    mfa_required boolean DEFAULT false NOT NULL,
    avatar_url text,
    phone character varying,
    bio text,
    job_title character varying,
    employee_id character varying,
    date_of_birth date,
    gender character varying,
    address text,
    emergency_contact_name character varying,
    emergency_contact_phone character varying,
    notification_preferences jsonb DEFAULT '{}'::jsonb,
    display_preferences jsonb DEFAULT '{}'::jsonb,
    reports_to uuid,
    email text
);


--
-- Name: TABLE profiles; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.profiles IS 'Legacy user profile table. One row per auth.users entry, created by the on_auth_user_created trigger. Extended by migration 007 with ERP fields. role column maps to user_role_legacy enum; migrated to user_roles table in Phase 1.0F.';


--
-- Name: COLUMN profiles.active; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.active IS 'False = user is disabled. AuthContext checks profile.active before granting isAuthenticated = true.';


--
-- Name: COLUMN profiles.company_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.company_id IS 'ERP business entity this user belongs to. NULL until Phase 1.0F migration assigns company_id.';


--
-- Name: COLUMN profiles.branch_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.branch_id IS 'Branch assignment. Optional. NULL = no branch restriction.';


--
-- Name: COLUMN profiles.department_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.department_id IS 'Department assignment. Optional. NULL = no department restriction.';


--
-- Name: COLUMN profiles.position_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.position_id IS 'Job position. Nullable FK to positions (added in migration 9). NULL = no position assigned.';


--
-- Name: COLUMN profiles.last_login_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.last_login_at IS 'Timestamp of most recent successful login. Updated by auth trigger or application layer.';


--
-- Name: COLUMN profiles.mfa_required; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.mfa_required IS 'True = MFA is mandatory for this user. Enforced by auth policy. Default false; set true for finance_controller, bod, admin, super_admin.';


--
-- Name: quotation_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quotation_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    quotation_id uuid NOT NULL,
    sort_order integer DEFAULT 0,
    description text NOT NULL,
    qty numeric DEFAULT 1,
    unit character varying,
    unit_price numeric(15,2) DEFAULT 0,
    notes text,
    group_name character varying DEFAULT 'CHARGES'::character varying,
    currency character varying DEFAULT 'IDR'::character varying,
    unit_label character varying DEFAULT 'Per 20Ft'::character varying,
    exchange_rate numeric(15,2) DEFAULT 1,
    total numeric(15,2) DEFAULT 0,
    cost_price numeric(15,2) DEFAULT 0,
    if_any boolean DEFAULT false NOT NULL
);


--
-- Name: quotations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quotations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    quotation_no text NOT NULL,
    revision integer DEFAULT 1,
    inquiry_id uuid,
    prospect_id uuid,
    customer_id uuid,
    service_type character varying,
    valid_until date,
    payment_terms_id uuid,
    currency_code character varying DEFAULT 'IDR'::character varying,
    notes text,
    terms text,
    subtotal numeric(15,2) DEFAULT 0,
    tax_amount numeric(15,2) DEFAULT 0,
    total_amount numeric(15,2) DEFAULT 0,
    status character varying DEFAULT 'DRAFT'::character varying,
    sent_at timestamp with time zone,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone,
    usd_rate numeric(15,2) DEFAULT 16000,
    route text,
    pricing_done_at timestamp with time zone,
    quote_sent_at timestamp with time zone,
    discount_pct numeric DEFAULT 0,
    margin_floor numeric DEFAULT 0,
    internal_notes text,
    quote_date date,
    vat_rate numeric DEFAULT 0.011,
    attention_to text,
    pickup_address text,
    delivery_address text,
    cargo_mode text,
    gw text,
    dimension text,
    cw text,
    cbm text,
    container_type text,
    container_qty integer,
    exchange_rates jsonb DEFAULT '{}'::jsonb NOT NULL,
    prf_id uuid
);


--
-- Name: COLUMN quotations.exchange_rates; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.quotations.exchange_rates IS 'Tabel kurs manual per-quotation: {"USD":16200,"SGD":12000}. IDR implisit = 1 (tak disimpan). Sumber kebenaran kurs; quotation_items.exchange_rate = salinan materialized (write-through) yang dibaca Detail & PDF. Input manual, tanpa lookup FX.';


--
-- Name: COLUMN quotations.prf_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.quotations.prf_id IS 'PRF yang jadi dasar harga quotation ini. Boleh null untuk quotation yang dibuat manual tanpa PRF.';


--
-- Name: rate_sheets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rate_sheets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    created_by uuid NOT NULL,
    rate_name text NOT NULL,
    valid_until date,
    columns jsonb DEFAULT '[]'::jsonb NOT NULL,
    rows jsonb DEFAULT '[]'::jsonb NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: role_permission_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_permission_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    role_id uuid NOT NULL,
    menu_action_id uuid NOT NULL,
    is_cross_entity boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: role_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_permissions (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    role_id uuid NOT NULL,
    permission_id uuid NOT NULL,
    granted_by uuid,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    is_cross_entity boolean DEFAULT false NOT NULL
);


--
-- Name: TABLE role_permissions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.role_permissions IS 'Links roles to permissions. No soft delete — revoke by deleting the row. Full matrix seed in Phase 1.0C.';


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    code character varying(50) NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    is_system_role boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: TABLE roles; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.roles IS 'Named permission sets, company-scoped. System roles are pre-seeded and cannot be modified by company Admins.';


--
-- Name: COLUMN roles.code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.roles.code IS 'Role code slug: super_admin, admin, bod, finance_controller, etc. Unique per company.';


--
-- Name: COLUMN roles.is_system_role; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.roles.is_system_role IS 'True = seeded by platform, cannot be renamed or deleted by company admin.';


--
-- Name: COLUMN roles.deleted_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.roles.deleted_at IS 'Soft delete. Custom roles only — system roles may not be deleted.';


--
-- Name: sales_calls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_calls (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    prospect_id uuid,
    salesperson_id uuid,
    call_date date DEFAULT CURRENT_DATE NOT NULL,
    call_time time without time zone,
    duration_minutes integer,
    call_type character varying(50),
    contact_name text,
    contact_phone text,
    bant_collected integer DEFAULT 0,
    result character varying(50),
    notes text,
    next_action text,
    next_action_date date,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: sales_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    so_no text NOT NULL,
    status character varying DEFAULT 'DRAFT'::character varying NOT NULL,
    inquiry_id uuid NOT NULL,
    account_id uuid NOT NULL,
    signed boolean DEFAULT false NOT NULL,
    sign_link text,
    signed_at timestamp with time zone,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone,
    external_ref text,
    booking_no text,
    CONSTRAINT sales_orders_status_check CHECK (((status)::text = ANY (ARRAY['DRAFT'::text, 'SENT'::text])))
);


--
-- Name: COLUMN sales_orders.external_ref; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sales_orders.external_ref IS 'Nomor referensi SO ini di sistem operasional (Odoo). Nullable, belum dipakai UI mana pun — kunci sambungan disiapkan lebih dulu supaya rekonsiliasi tidak perlu mencari padanan manual nanti.';


--
-- Name: COLUMN sales_orders.booking_no; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sales_orders.booking_no IS 'Nomor booking ke carrier. Nullable, belum dipakai UI mana pun.';


--
-- Name: sales_orders_backup_20260722; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_orders_backup_20260722 (
    id uuid,
    company_id uuid,
    so_no text,
    status character varying,
    inquiry_id uuid,
    account_id uuid,
    signed boolean,
    sign_link text,
    signed_at timestamp with time zone,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone,
    external_ref text,
    booking_no text
);


--
-- Name: sales_visit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_visit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    visit_id uuid NOT NULL,
    changed_by uuid,
    changed_at timestamp with time zone DEFAULT now(),
    from_status character varying(50),
    to_status character varying(50),
    notes text
);


--
-- Name: sales_visits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_visits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    prospect_id uuid,
    salesperson_id uuid,
    visit_date date NOT NULL,
    visit_time time without time zone,
    location text,
    notes text,
    status character varying(50) DEFAULT 'scheduled'::character varying,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    point_of_meeting text,
    mom text,
    follow_up text,
    visit_type text
);


--
-- Name: sp_btb; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sp_btb (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    sp_order_id uuid NOT NULL,
    delivery_note_id uuid,
    customer_id uuid NOT NULL,
    btb_no text NOT NULL,
    btb_date date,
    qty integer,
    received_at timestamp with time zone,
    received_by uuid,
    remarks text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT sp_btb_qty_check CHECK (((qty IS NULL) OR (qty >= 0)))
);


--
-- Name: sp_btbs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sp_btbs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sp_no text NOT NULL,
    btb_no text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    remarks text
);


--
-- Name: sp_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sp_items (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    sp_date date,
    sp_no text DEFAULT ''::text NOT NULL,
    customer_id uuid,
    product_name text DEFAULT ''::text NOT NULL,
    sku text DEFAULT ''::text NOT NULL,
    qty integer DEFAULT 0 NOT NULL,
    shipped_qty integer DEFAULT 0 NOT NULL,
    exp_date date,
    expired_date date,
    dc text DEFAULT ''::text NOT NULL,
    shipping_date date,
    btb_no_deprecated text DEFAULT ''::text NOT NULL,
    unit_price numeric(18,2) DEFAULT 0 NOT NULL,
    shipping_price numeric(18,2) DEFAULT 0 NOT NULL,
    inv boolean DEFAULT false NOT NULL,
    fp boolean DEFAULT false NOT NULL,
    submit boolean DEFAULT false NOT NULL,
    kirim boolean DEFAULT false NOT NULL,
    submit_date date,
    email_status text,
    notes text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    sla_days integer,
    estimated_delivery_date date,
    arrival_date date,
    sp_status text DEFAULT 'draft'::text NOT NULL,
    confirmed_at timestamp with time zone,
    confirmed_by uuid,
    cancelled_at timestamp with time zone,
    cancelled_by uuid,
    cancel_reason text,
    sp_category text,
    external_url text,
    product_id uuid,
    price_category text,
    review_status text,
    CONSTRAINT sp_items_sp_status_check CHECK ((sp_status = ANY (ARRAY['draft'::text, 'confirmed'::text, 'cancelled'::text])))
);


--
-- Name: TABLE sp_items; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.sp_items IS 'SP (Surat Pesanan) line items — core freight manifest. Multiple rows share the same sp_no and are grouped in the app by groupBySP(). customer_id FK ON DELETE SET NULL preserves rows if customer is deleted.';


--
-- Name: COLUMN sp_items.inv; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sp_items.inv IS 'Invoice document issued flag.';


--
-- Name: COLUMN sp_items.fp; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sp_items.fp IS 'Faktur Pajak (tax invoice) issued flag.';


--
-- Name: COLUMN sp_items.email_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sp_items.email_status IS 'Stored as text (not date). App renders it in a date input (type=date) but treats it as a string. Empty string stored as NULL.';


--
-- Name: sp_order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sp_order_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sp_order_id uuid NOT NULL,
    company_id uuid NOT NULL,
    product_id uuid NOT NULL,
    product_name text DEFAULT ''::text NOT NULL,
    sku text DEFAULT ''::text NOT NULL,
    qty integer DEFAULT 0 NOT NULL,
    shipped_qty integer DEFAULT 0 NOT NULL,
    unit_price numeric(18,2) DEFAULT 0 NOT NULL,
    price_category text,
    shipping_price numeric(18,2) DEFAULT 0 NOT NULL,
    sla_days integer,
    estimated_delivery_date date,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    legacy_sp_item_id uuid,
    CONSTRAINT sp_order_items_check CHECK (((shipped_qty >= 0) AND (shipped_qty <= qty))),
    CONSTRAINT sp_order_items_price_category_check CHECK ((price_category = ANY (ARRAY['semester'::text, 'tahunan'::text, 'project'::text]))),
    CONSTRAINT sp_order_items_qty_check CHECK ((qty >= 1))
);


--
-- Name: sp_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sp_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    sp_no text NOT NULL,
    sp_date date,
    dc_id uuid NOT NULL,
    status text DEFAULT 'DRAFT'::text NOT NULL,
    is_disputed boolean DEFAULT false NOT NULL,
    dispute_reason text,
    disputed_at timestamp with time zone,
    disputed_by uuid,
    expired_date date,
    sp_category text,
    external_url text,
    notes text,
    confirmed_at timestamp with time zone,
    confirmed_by uuid,
    cancelled_at timestamp with time zone,
    cancelled_by uuid,
    cancel_reason text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    had_cancelled_picking boolean DEFAULT false NOT NULL,
    CONSTRAINT sp_orders_status_check CHECK ((status = ANY (ARRAY['DRAFT'::text, 'CONFIRMED'::text, 'MENUNGGU_STOK'::text, 'PICKING'::text, 'PACKED'::text, 'DIKIRIM'::text, 'SAMPAI'::text, 'BTB_TERBIT'::text, 'TERKIRIM_PENUH'::text, 'INVOICED'::text, 'SUBMITTED'::text, 'LUNAS'::text, 'CANCELLED'::text])))
);


--
-- Name: status_catalog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.status_catalog (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    code character varying(50) NOT NULL,
    label character varying(100) NOT NULL,
    description text,
    color_class character varying(100),
    applicable_modules jsonb,
    is_terminal boolean DEFAULT false NOT NULL,
    sort_order smallint DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE status_catalog; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.status_catalog IS 'Global registry of all valid status values. Reference only — document tables store status as varchar, not as FK. See docs/workflow/status-lifecycle.md.';


--
-- Name: COLUMN status_catalog.code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.status_catalog.code IS 'Snake_case status code, e.g. draft, submitted, under_review. Globally unique.';


--
-- Name: COLUMN status_catalog.color_class; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.status_catalog.color_class IS 'Tailwind CSS class string for UI badges, e.g. bg-yellow-100 text-yellow-800.';


--
-- Name: COLUMN status_catalog.applicable_modules; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.status_catalog.applicable_modules IS 'JSON array of module slugs this status applies to. NULL means applicable to all modules.';


--
-- Name: COLUMN status_catalog.is_terminal; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.status_catalog.is_terminal IS 'If true, no further status transition is allowed from this state (rejected, cancelled, archived, completed).';


--
-- Name: stock_ledger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_ledger (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    warehouse_id uuid NOT NULL,
    product_id uuid NOT NULL,
    movement_type character varying(20) NOT NULL,
    qty integer NOT NULL,
    reference_type character varying(20),
    reference_id uuid,
    reference_no character varying(50),
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    location_detail text,
    last_count_date date,
    CONSTRAINT stock_ledger_movement_type_check CHECK (((movement_type)::text = ANY ((ARRAY['inbound'::character varying, 'outbound'::character varying, 'adjustment'::character varying, 'reserved'::character varying, 'unreserved'::character varying, 'transfer_in'::character varying, 'transfer_out'::character varying])::text[])))
);


--
-- Name: stock_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.stock_summary WITH (security_invoker='true') AS
 SELECT product_id,
    warehouse_id,
    company_id,
    sum(qty) FILTER (WHERE ((movement_type)::text = ANY ((ARRAY['inbound'::character varying, 'outbound'::character varying, 'adjustment'::character varying, 'transfer_in'::character varying, 'transfer_out'::character varying])::text[]))) AS on_hand,
    (sum(
        CASE
            WHEN ((movement_type)::text = 'reserved'::text) THEN abs(qty)
            ELSE 0
        END) - sum(
        CASE
            WHEN ((movement_type)::text = 'unreserved'::text) THEN abs(qty)
            ELSE 0
        END)) AS reserved,
    (sum(qty) FILTER (WHERE ((movement_type)::text = ANY ((ARRAY['inbound'::character varying, 'outbound'::character varying, 'adjustment'::character varying, 'transfer_in'::character varying, 'transfer_out'::character varying])::text[]))) - (sum(
        CASE
            WHEN ((movement_type)::text = 'reserved'::text) THEN abs(qty)
            ELSE 0
        END) - sum(
        CASE
            WHEN ((movement_type)::text = 'unreserved'::text) THEN abs(qty)
            ELSE 0
        END))) AS available,
    max(last_count_date) AS last_count_date
   FROM public.stock_ledger
  GROUP BY product_id, warehouse_id, company_id;


--
-- Name: taxes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.taxes (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    code character varying(20) NOT NULL,
    name character varying(100) NOT NULL,
    rate numeric(7,4) NOT NULL,
    tax_type character varying(30) DEFAULT 'percentage'::character varying NOT NULL,
    is_inclusive boolean DEFAULT false NOT NULL,
    gl_account_id uuid,
    notes text,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT taxes_rate_check CHECK ((rate >= (0)::numeric)),
    CONSTRAINT taxes_tax_type_check CHECK (((tax_type)::text = ANY ((ARRAY['percentage'::character varying, 'fixed'::character varying])::text[])))
);


--
-- Name: TABLE taxes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.taxes IS 'Company-scoped tax code registry. Indonesian context: PPN (VAT), PPh23, PPh21. Never modify rate on a code used in posted transactions — deactivate and create new instead.';


--
-- Name: COLUMN taxes.rate; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.taxes.rate IS 'Tax rate as a percentage value: 11.0000 = 11%. For fixed type, this is the fixed amount per unit.';


--
-- Name: COLUMN taxes.is_inclusive; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.taxes.is_inclusive IS 'True = tax is already included in the price (tax-inclusive). False = tax is added on top of the base price.';


--
-- Name: COLUMN taxes.gl_account_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.taxes.gl_account_id IS 'Nullable FK to chart_of_accounts. Set during Phase 3 when COA is configured.';


--
-- Name: top_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.top_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    account_id uuid,
    nama_perusahaan text,
    alamat_kantor text,
    alamat_gudang text,
    telepon text,
    email text,
    website text,
    npwp text,
    nib text,
    direktur_nama text,
    direktur_ktp text,
    status_pkp text,
    industri text,
    tahun_berdiri text,
    jumlah_karyawan text,
    revenue_tahunan text,
    produk_utama text,
    customer_utama text,
    supplier_utama text,
    volume_bulanan text,
    total_aset numeric(18,2),
    total_liabilities numeric(18,2),
    annual_revenue numeric(18,2),
    net_profit_margin text,
    laporan_keuangan text,
    outstanding_hutang text,
    bank_1_nama text,
    bank_1_rekening text,
    bank_1_cabang text,
    bank_1_contact text,
    bank_2_nama text,
    bank_2_rekening text,
    bank_2_cabang text,
    bank_2_contact text,
    trade_ref_1 text,
    trade_ref_2 text,
    trade_ref_3 text,
    top_requested text,
    credit_limit_diminta numeric(18,2),
    service_type text,
    estimasi_volume text,
    alasan_top text,
    pefindo_score text,
    bank_ref_verified text,
    trade_ref_verified text,
    credit_limit_approved numeric(18,2),
    top_approved text,
    effective_date date,
    review_date date,
    catatan text,
    status text DEFAULT 'draft'::text,
    submitted_at timestamp with time zone,
    approved_by uuid,
    approved_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT top_requests_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'submitted'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: user_login_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_login_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    session_id uuid,
    logged_in_at timestamp with time zone DEFAULT now() NOT NULL,
    ip text,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_menu_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_menu_permissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    menu_action_id uuid,
    is_cross_entity boolean DEFAULT false,
    company_id uuid,
    granted_by uuid,
    granted_at timestamp with time zone DEFAULT now(),
    module_action_id uuid,
    CONSTRAINT ump_one_action_required CHECK ((((module_action_id IS NOT NULL) AND (menu_action_id IS NULL)) OR ((module_action_id IS NULL) AND (menu_action_id IS NOT NULL))))
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    role_id uuid NOT NULL,
    company_id uuid NOT NULL,
    valid_from date,
    valid_until date,
    is_active boolean DEFAULT true NOT NULL,
    granted_by uuid,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_by uuid,
    revoked_at timestamp with time zone
);


--
-- Name: TABLE user_roles; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.user_roles IS 'User-to-role assignments. A user may have multiple roles within one company. valid_from/until enables time-bound grants.';


--
-- Name: COLUMN user_roles.valid_until; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_roles.valid_until IS 'NULL = no expiry. If set, role should be checked against current date at permission evaluation.';


--
-- Name: COLUMN user_roles.is_active; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_roles.is_active IS 'False = role revoked. Row is kept for audit history.';


--
-- Name: vendors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendors (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    code character varying(20) NOT NULL,
    name character varying(100) NOT NULL,
    legal_name character varying(200),
    vendor_type character varying(50),
    tax_id character varying(50),
    address text,
    city character varying(100),
    country character varying(100) DEFAULT 'Indonesia'::character varying,
    phone character varying(50),
    email character varying(100),
    pic_name character varying(100),
    pic_phone character varying(50),
    bank_name character varying(100),
    bank_account character varying(50),
    bank_account_name character varying(100),
    payment_terms_id uuid,
    currency_code character varying(3) DEFAULT 'IDR'::character varying,
    notes text,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: TABLE vendors; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.vendors IS 'Company-scoped vendor master. Covers suppliers, shipping lines, truckers, customs agents, and sub-contractors.';


--
-- Name: COLUMN vendors.code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.vendors.code IS 'Vendor code, unique per company. e.g. VND-0001.';


--
-- Name: COLUMN vendors.vendor_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.vendors.vendor_type IS 'Classification: Shipping Line, Trucker, Customs Agent, Supplier, Sub-contractor, General.';


--
-- Name: COLUMN vendors.bank_account; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.vendors.bank_account IS 'SENSITIVE: Display only last 4 digits to non-Finance roles. Full value stored for AP payment processing.';


--
-- Name: warehouses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warehouses (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    code character varying(20) NOT NULL,
    name character varying(100) NOT NULL,
    city character varying(100),
    address text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: activities activities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activities
    ADD CONSTRAINT activities_pkey PRIMARY KEY (id);


--
-- Name: activity_logs activity_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_logs
    ADD CONSTRAINT activity_logs_pkey PRIMARY KEY (id);


--
-- Name: app_settings app_settings_company_id_category_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_company_id_category_key_key UNIQUE (company_id, category, key);


--
-- Name: app_settings app_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_pkey PRIMARY KEY (id);


--
-- Name: approval_delegations approval_delegations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_delegations
    ADD CONSTRAINT approval_delegations_pkey PRIMARY KEY (id);


--
-- Name: approval_logs approval_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_logs
    ADD CONSTRAINT approval_logs_pkey PRIMARY KEY (id);


--
-- Name: approval_rules approval_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_rules
    ADD CONSTRAINT approval_rules_pkey PRIMARY KEY (id);


--
-- Name: approval_workflow_steps approval_workflow_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_workflow_steps
    ADD CONSTRAINT approval_workflow_steps_pkey PRIMARY KEY (id);


--
-- Name: approval_workflow_steps approval_workflow_steps_workflow_id_step_order_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_workflow_steps
    ADD CONSTRAINT approval_workflow_steps_workflow_id_step_order_key UNIQUE (workflow_id, step_order);


--
-- Name: approval_workflows approval_workflows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_workflows
    ADD CONSTRAINT approval_workflows_pkey PRIMARY KEY (id);


--
-- Name: ar_btbs ar_btbs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ar_btbs
    ADD CONSTRAINT ar_btbs_pkey PRIMARY KEY (id);


--
-- Name: ar_ttfs ar_ttfs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ar_ttfs
    ADD CONSTRAINT ar_ttfs_pkey PRIMARY KEY (id);


--
-- Name: asset_categories asset_categories_company_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_categories
    ADD CONSTRAINT asset_categories_company_code_unique UNIQUE (company_id, code);


--
-- Name: asset_categories asset_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_categories
    ADD CONSTRAINT asset_categories_pkey PRIMARY KEY (id);


--
-- Name: asset_fuel_logs asset_fuel_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_fuel_logs
    ADD CONSTRAINT asset_fuel_logs_pkey PRIMARY KEY (id);


--
-- Name: asset_locations asset_locations_company_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_locations
    ADD CONSTRAINT asset_locations_company_code_unique UNIQUE (company_id, code);


--
-- Name: asset_locations asset_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_locations
    ADD CONSTRAINT asset_locations_pkey PRIMARY KEY (id);


--
-- Name: asset_maintenance_records asset_maintenance_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_maintenance_records
    ADD CONSTRAINT asset_maintenance_records_pkey PRIMARY KEY (id);


--
-- Name: asset_network asset_network_asset_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_network
    ADD CONSTRAINT asset_network_asset_unique UNIQUE (asset_id);


--
-- Name: asset_network asset_network_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_network
    ADD CONSTRAINT asset_network_pkey PRIMARY KEY (id);


--
-- Name: asset_software_licenses asset_software_licenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_software_licenses
    ADD CONSTRAINT asset_software_licenses_pkey PRIMARY KEY (id);


--
-- Name: asset_specifications asset_specifications_asset_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_specifications
    ADD CONSTRAINT asset_specifications_asset_unique UNIQUE (asset_id);


--
-- Name: asset_specifications asset_specifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_specifications
    ADD CONSTRAINT asset_specifications_pkey PRIMARY KEY (id);


--
-- Name: assets assets_company_no_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_company_no_unique UNIQUE (company_id, asset_no);


--
-- Name: assets assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: branches branches_company_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_company_code_unique UNIQUE (company_id, code);


--
-- Name: branches branches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_pkey PRIMARY KEY (id);


--
-- Name: chart_of_accounts chart_of_accounts_company_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chart_of_accounts
    ADD CONSTRAINT chart_of_accounts_company_code_unique UNIQUE (company_id, code);


--
-- Name: chart_of_accounts chart_of_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chart_of_accounts
    ADD CONSTRAINT chart_of_accounts_pkey PRIMARY KEY (id);


--
-- Name: code_counters code_counters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.code_counters
    ADD CONSTRAINT code_counters_pkey PRIMARY KEY (entity, year);


--
-- Name: companies companies_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_code_unique UNIQUE (code);


--
-- Name: companies companies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (id);


--
-- Name: cost_centers cost_centers_company_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cost_centers
    ADD CONSTRAINT cost_centers_company_code_unique UNIQUE (company_id, code);


--
-- Name: cost_centers cost_centers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cost_centers
    ADD CONSTRAINT cost_centers_pkey PRIMARY KEY (id);


--
-- Name: currencies currencies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.currencies
    ADD CONSTRAINT currencies_pkey PRIMARY KEY (code);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: dc_master dc_master_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dc_master
    ADD CONSTRAINT dc_master_pkey PRIMARY KEY (id);


--
-- Name: deal_handovers deal_handovers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_handovers
    ADD CONSTRAINT deal_handovers_pkey PRIMARY KEY (id);


--
-- Name: delivery_note_items delivery_note_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_note_items
    ADD CONSTRAINT delivery_note_items_pkey PRIMARY KEY (id);


--
-- Name: delivery_notes delivery_notes_do_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_notes
    ADD CONSTRAINT delivery_notes_do_no_key UNIQUE (do_no);


--
-- Name: delivery_notes delivery_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_notes
    ADD CONSTRAINT delivery_notes_pkey PRIMARY KEY (id);


--
-- Name: departments departments_company_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_company_code_unique UNIQUE (company_id, code);


--
-- Name: departments departments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_pkey PRIMARY KEY (id);


--
-- Name: document_numbering document_numbering_company_id_document_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_numbering
    ADD CONSTRAINT document_numbering_company_id_document_type_key UNIQUE (company_id, document_type);


--
-- Name: document_numbering document_numbering_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_numbering
    ADD CONSTRAINT document_numbering_pkey PRIMARY KEY (id);


--
-- Name: document_sequences document_sequences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_sequences
    ADD CONSTRAINT document_sequences_pkey PRIMARY KEY (id);


--
-- Name: document_sequences document_sequences_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_sequences
    ADD CONSTRAINT document_sequences_unique UNIQUE (company_id, document_type, department_code, year, month);


--
-- Name: document_templates document_templates_company_id_document_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_templates
    ADD CONSTRAINT document_templates_company_id_document_type_key UNIQUE (company_id, document_type);


--
-- Name: document_templates document_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_templates
    ADD CONSTRAINT document_templates_pkey PRIMARY KEY (id);


--
-- Name: document_types document_types_company_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_types
    ADD CONSTRAINT document_types_company_code_unique UNIQUE (company_id, code);


--
-- Name: document_types document_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_types
    ADD CONSTRAINT document_types_pkey PRIMARY KEY (id);


--
-- Name: dropdown_options dropdown_options_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dropdown_options
    ADD CONSTRAINT dropdown_options_pkey PRIMARY KEY (id);


--
-- Name: entity_bank_accounts entity_bank_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_bank_accounts
    ADD CONSTRAINT entity_bank_accounts_pkey PRIMARY KEY (id);


--
-- Name: entity_finance_settings entity_finance_settings_company_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_finance_settings
    ADD CONSTRAINT entity_finance_settings_company_id_key UNIQUE (company_id);


--
-- Name: entity_finance_settings entity_finance_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_finance_settings
    ADD CONSTRAINT entity_finance_settings_pkey PRIMARY KEY (id);


--
-- Name: entity_signatories entity_signatories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_signatories
    ADD CONSTRAINT entity_signatories_pkey PRIMARY KEY (id);


--
-- Name: exchange_rates exchange_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_rates
    ADD CONSTRAINT exchange_rates_pkey PRIMARY KEY (id);


--
-- Name: exchange_rates exchange_rates_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_rates
    ADD CONSTRAINT exchange_rates_unique UNIQUE (company_id, from_currency, to_currency, effective_date);


--
-- Name: hrga_approval_configs hrga_approval_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hrga_approval_configs
    ADD CONSTRAINT hrga_approval_configs_pkey PRIMARY KEY (id);


--
-- Name: hrga_approval_configs hrga_approval_configs_type_level_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hrga_approval_configs
    ADD CONSTRAINT hrga_approval_configs_type_level_unique UNIQUE (request_type_id, level);


--
-- Name: hrga_notification_queue hrga_notification_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hrga_notification_queue
    ADD CONSTRAINT hrga_notification_queue_pkey PRIMARY KEY (id);


--
-- Name: hrga_offboarding_checklists hrga_offboarding_checklists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hrga_offboarding_checklists
    ADD CONSTRAINT hrga_offboarding_checklists_pkey PRIMARY KEY (id);


--
-- Name: hrga_offboarding_items hrga_offboarding_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hrga_offboarding_items
    ADD CONSTRAINT hrga_offboarding_items_pkey PRIMARY KEY (id);


--
-- Name: hrga_request_approvals hrga_request_approvals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hrga_request_approvals
    ADD CONSTRAINT hrga_request_approvals_pkey PRIMARY KEY (id);


--
-- Name: hrga_request_attachments hrga_request_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hrga_request_attachments
    ADD CONSTRAINT hrga_request_attachments_pkey PRIMARY KEY (id);


--
-- Name: hrga_request_items hrga_request_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hrga_request_items
    ADD CONSTRAINT hrga_request_items_pkey PRIMARY KEY (id);


--
-- Name: hrga_request_types hrga_request_types_company_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hrga_request_types
    ADD CONSTRAINT hrga_request_types_company_code_unique UNIQUE (company_id, type_code);


--
-- Name: hrga_request_types hrga_request_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hrga_request_types
    ADD CONSTRAINT hrga_request_types_pkey PRIMARY KEY (id);


--
-- Name: hrga_requests hrga_requests_document_no_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hrga_requests
    ADD CONSTRAINT hrga_requests_document_no_unique UNIQUE (company_id, document_no);


--
-- Name: hrga_requests hrga_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hrga_requests
    ADD CONSTRAINT hrga_requests_pkey PRIMARY KEY (id);


--
-- Name: inquiries inquiries_inquiry_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inquiries
    ADD CONSTRAINT inquiries_inquiry_no_key UNIQUE (inquiry_no);


--
-- Name: inquiries inquiries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inquiries
    ADD CONSTRAINT inquiries_pkey PRIMARY KEY (id);


--
-- Name: meeting_moms meeting_moms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_moms
    ADD CONSTRAINT meeting_moms_pkey PRIMARY KEY (id);


--
-- Name: menu_actions menu_actions_menu_id_action_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_actions
    ADD CONSTRAINT menu_actions_menu_id_action_key UNIQUE (menu_id, action);


--
-- Name: menu_actions menu_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_actions
    ADD CONSTRAINT menu_actions_pkey PRIMARY KEY (id);


--
-- Name: module_actions module_actions_module_id_action_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.module_actions
    ADD CONSTRAINT module_actions_module_id_action_key UNIQUE (module_id, action);


--
-- Name: module_actions module_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.module_actions
    ADD CONSTRAINT module_actions_pkey PRIMARY KEY (id);


--
-- Name: module_menus module_menus_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.module_menus
    ADD CONSTRAINT module_menus_key_key UNIQUE (key);


--
-- Name: module_menus module_menus_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.module_menus
    ADD CONSTRAINT module_menus_pkey PRIMARY KEY (id);


--
-- Name: modules modules_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.modules
    ADD CONSTRAINT modules_key_key UNIQUE (key);


--
-- Name: modules modules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.modules
    ADD CONSTRAINT modules_pkey PRIMARY KEY (id);


--
-- Name: mom_action_plans mom_action_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mom_action_plans
    ADD CONSTRAINT mom_action_plans_pkey PRIMARY KEY (id);


--
-- Name: mom_improvements mom_improvements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mom_improvements
    ADD CONSTRAINT mom_improvements_pkey PRIMARY KEY (id);


--
-- Name: mom_issues mom_issues_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mom_issues
    ADD CONSTRAINT mom_issues_pkey PRIMARY KEY (id);


--
-- Name: mom_progress_updates mom_progress_updates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mom_progress_updates
    ADD CONSTRAINT mom_progress_updates_pkey PRIMARY KEY (id);


--
-- Name: notification_rules notification_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_rules
    ADD CONSTRAINT notification_rules_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: payment_terms payment_terms_company_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_terms
    ADD CONSTRAINT payment_terms_company_code_unique UNIQUE (company_id, code);


--
-- Name: payment_terms payment_terms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_terms
    ADD CONSTRAINT payment_terms_pkey PRIMARY KEY (id);


--
-- Name: permissions permissions_module_action_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_module_action_unique UNIQUE (module, action);


--
-- Name: permissions permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_pkey PRIMARY KEY (id);


--
-- Name: picking_list_items picking_list_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.picking_list_items
    ADD CONSTRAINT picking_list_items_pkey PRIMARY KEY (id);


--
-- Name: picking_list_materials picking_list_materials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.picking_list_materials
    ADD CONSTRAINT picking_list_materials_pkey PRIMARY KEY (id);


--
-- Name: picking_lists picking_lists_picking_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.picking_lists
    ADD CONSTRAINT picking_lists_picking_no_key UNIQUE (picking_no);


--
-- Name: picking_lists picking_lists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.picking_lists
    ADD CONSTRAINT picking_lists_pkey PRIMARY KEY (id);


--
-- Name: positions positions_company_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.positions
    ADD CONSTRAINT positions_company_code_unique UNIQUE (company_id, code);


--
-- Name: positions positions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.positions
    ADD CONSTRAINT positions_pkey PRIMARY KEY (id);


--
-- Name: prf_cost_items prf_cost_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prf_cost_items
    ADD CONSTRAINT prf_cost_items_pkey PRIMARY KEY (id);


--
-- Name: prf prf_no_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prf
    ADD CONSTRAINT prf_no_unique UNIQUE (company_id, prf_no);


--
-- Name: prf prf_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prf
    ADD CONSTRAINT prf_pkey PRIMARY KEY (id);


--
-- Name: product_price_history product_price_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_price_history
    ADD CONSTRAINT product_price_history_pkey PRIMARY KEY (id);


--
-- Name: product_warehouse_location product_warehouse_location_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_warehouse_location
    ADD CONSTRAINT product_warehouse_location_pkey PRIMARY KEY (id);


--
-- Name: products products_company_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_company_code_unique UNIQUE (company_id, code);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: accounts prospects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT prospects_pkey PRIMARY KEY (id);


--
-- Name: product_warehouse_location pwl_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_warehouse_location
    ADD CONSTRAINT pwl_uniq UNIQUE (product_id, warehouse_id);


--
-- Name: quotation_items quotation_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotation_items
    ADD CONSTRAINT quotation_items_pkey PRIMARY KEY (id);


--
-- Name: quotations quotations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotations
    ADD CONSTRAINT quotations_pkey PRIMARY KEY (id);


--
-- Name: quotations quotations_quotation_no_revision_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotations
    ADD CONSTRAINT quotations_quotation_no_revision_key UNIQUE (quotation_no, revision);


--
-- Name: rate_sheets rate_sheets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rate_sheets
    ADD CONSTRAINT rate_sheets_pkey PRIMARY KEY (id);


--
-- Name: role_permission_templates role_permission_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permission_templates
    ADD CONSTRAINT role_permission_templates_pkey PRIMARY KEY (id);


--
-- Name: role_permission_templates role_permission_templates_role_id_menu_action_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permission_templates
    ADD CONSTRAINT role_permission_templates_role_id_menu_action_id_key UNIQUE (role_id, menu_action_id);


--
-- Name: role_permissions role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (id);


--
-- Name: role_permissions role_permissions_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_unique UNIQUE (role_id, permission_id);


--
-- Name: roles roles_company_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_company_code_unique UNIQUE (company_id, code);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: sales_calls sales_calls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_calls
    ADD CONSTRAINT sales_calls_pkey PRIMARY KEY (id);


--
-- Name: sales_orders sales_orders_no_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_orders
    ADD CONSTRAINT sales_orders_no_unique UNIQUE (company_id, so_no);


--
-- Name: sales_orders sales_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_orders
    ADD CONSTRAINT sales_orders_pkey PRIMARY KEY (id);


--
-- Name: sales_visit_logs sales_visit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_visit_logs
    ADD CONSTRAINT sales_visit_logs_pkey PRIMARY KEY (id);


--
-- Name: sales_visits sales_visits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_visits
    ADD CONSTRAINT sales_visits_pkey PRIMARY KEY (id);


--
-- Name: sp_btb sp_btb_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sp_btb
    ADD CONSTRAINT sp_btb_pkey PRIMARY KEY (id);


--
-- Name: sp_btbs sp_btbs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sp_btbs
    ADD CONSTRAINT sp_btbs_pkey PRIMARY KEY (id);


--
-- Name: sp_items sp_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sp_items
    ADD CONSTRAINT sp_items_pkey PRIMARY KEY (id);


--
-- Name: sp_order_items sp_order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sp_order_items
    ADD CONSTRAINT sp_order_items_pkey PRIMARY KEY (id);


--
-- Name: sp_orders sp_orders_no_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sp_orders
    ADD CONSTRAINT sp_orders_no_unique UNIQUE (customer_id, sp_no);


--
-- Name: sp_orders sp_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sp_orders
    ADD CONSTRAINT sp_orders_pkey PRIMARY KEY (id);


--
-- Name: status_catalog status_catalog_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.status_catalog
    ADD CONSTRAINT status_catalog_code_unique UNIQUE (code);


--
-- Name: status_catalog status_catalog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.status_catalog
    ADD CONSTRAINT status_catalog_pkey PRIMARY KEY (id);


--
-- Name: stock_ledger stock_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_ledger
    ADD CONSTRAINT stock_ledger_pkey PRIMARY KEY (id);


--
-- Name: taxes taxes_company_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.taxes
    ADD CONSTRAINT taxes_company_code_unique UNIQUE (company_id, code);


--
-- Name: taxes taxes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.taxes
    ADD CONSTRAINT taxes_pkey PRIMARY KEY (id);


--
-- Name: top_requests top_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.top_requests
    ADD CONSTRAINT top_requests_pkey PRIMARY KEY (id);


--
-- Name: user_login_logs user_login_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_login_logs
    ADD CONSTRAINT user_login_logs_pkey PRIMARY KEY (id);


--
-- Name: user_menu_permissions user_menu_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_menu_permissions
    ADD CONSTRAINT user_menu_permissions_pkey PRIMARY KEY (id);


--
-- Name: user_menu_permissions user_menu_permissions_user_id_menu_action_id_company_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_menu_permissions
    ADD CONSTRAINT user_menu_permissions_user_id_menu_action_id_company_id_key UNIQUE (user_id, menu_action_id, company_id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_unique UNIQUE (user_id, role_id, company_id);


--
-- Name: vendors vendors_company_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendors
    ADD CONSTRAINT vendors_company_code_unique UNIQUE (company_id, code);


--
-- Name: vendors vendors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendors
    ADD CONSTRAINT vendors_pkey PRIMARY KEY (id);


--
-- Name: warehouses warehouses_company_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouses
    ADD CONSTRAINT warehouses_company_code_unique UNIQUE (company_id, code);


--
-- Name: warehouses warehouses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouses
    ADD CONSTRAINT warehouses_pkey PRIMARY KEY (id);


--
-- Name: accounts_code_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX accounts_code_unique ON public.accounts USING btree (code) WHERE (code IS NOT NULL);


--
-- Name: dropdown_options_entity_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX dropdown_options_entity_unique ON public.dropdown_options USING btree (company_id, list_key, value) WHERE (company_id IS NOT NULL);


--
-- Name: dropdown_options_global_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX dropdown_options_global_unique ON public.dropdown_options USING btree (list_key, value) WHERE (company_id IS NULL);


--
-- Name: idx_activities_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activities_account ON public.activities USING btree (account_id);


--
-- Name: idx_activities_assigned; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activities_assigned ON public.activities USING btree (assigned_to);


--
-- Name: idx_activities_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activities_company ON public.activities USING btree (company_id);


--
-- Name: idx_activities_sched; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activities_sched ON public.activities USING btree (scheduled_for);


--
-- Name: idx_activities_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activities_status ON public.activities USING btree (status);


--
-- Name: idx_activities_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activities_type ON public.activities USING btree (type);


--
-- Name: idx_activity_logs_activity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_logs_activity ON public.activity_logs USING btree (activity_id);


--
-- Name: idx_app_settings_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_app_settings_category ON public.app_settings USING btree (category, key);


--
-- Name: idx_app_settings_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_app_settings_company ON public.app_settings USING btree (company_id);


--
-- Name: idx_approval_delegations_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_approval_delegations_company_id ON public.approval_delegations USING btree (company_id);


--
-- Name: idx_approval_delegations_delegate; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_approval_delegations_delegate ON public.approval_delegations USING btree (delegate_id, valid_from, valid_until) WHERE (is_active = true);


--
-- Name: idx_approval_delegations_delegator; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_approval_delegations_delegator ON public.approval_delegations USING btree (delegator_id);


--
-- Name: idx_approval_logs_acted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_approval_logs_acted_at ON public.approval_logs USING btree (company_id, acted_at DESC);


--
-- Name: idx_approval_logs_actor_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_approval_logs_actor_id ON public.approval_logs USING btree (actor_id);


--
-- Name: idx_approval_logs_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_approval_logs_company_id ON public.approval_logs USING btree (company_id);


--
-- Name: idx_approval_logs_document; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_approval_logs_document ON public.approval_logs USING btree (company_id, document_type, document_id);


--
-- Name: idx_approval_rules_company_doctype; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_approval_rules_company_doctype ON public.approval_rules USING btree (company_id, document_type) WHERE (is_active = true);


--
-- Name: idx_approval_rules_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_approval_rules_company_id ON public.approval_rules USING btree (company_id);


--
-- Name: idx_ar_btbs_ttf_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ar_btbs_ttf_id ON public.ar_btbs USING btree (ttf_id, "position");


--
-- Name: idx_ar_ttfs_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ar_ttfs_customer_id ON public.ar_ttfs USING btree (customer_id);


--
-- Name: idx_ar_ttfs_tanggal_ttf; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ar_ttfs_tanggal_ttf ON public.ar_ttfs USING btree (tanggal_ttf DESC NULLS LAST);


--
-- Name: idx_ar_ttfs_tgl_pembayaran; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ar_ttfs_tgl_pembayaran ON public.ar_ttfs USING btree (tgl_pembayaran);


--
-- Name: idx_asset_categories_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_asset_categories_company_id ON public.asset_categories USING btree (company_id);


--
-- Name: idx_asset_categories_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_asset_categories_deleted_at ON public.asset_categories USING btree (deleted_at) WHERE (deleted_at IS NOT NULL);


--
-- Name: idx_asset_fuel_logs_asset_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_asset_fuel_logs_asset_id ON public.asset_fuel_logs USING btree (asset_id, fill_date DESC) WHERE (deleted_at IS NULL);


--
-- Name: idx_asset_fuel_logs_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_asset_fuel_logs_company_id ON public.asset_fuel_logs USING btree (company_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_asset_locations_branch_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_asset_locations_branch_id ON public.asset_locations USING btree (branch_id);


--
-- Name: idx_asset_locations_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_asset_locations_company_id ON public.asset_locations USING btree (company_id);


--
-- Name: idx_asset_locations_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_asset_locations_deleted_at ON public.asset_locations USING btree (deleted_at) WHERE (deleted_at IS NOT NULL);


--
-- Name: idx_asset_maintenance_asset_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_asset_maintenance_asset_id ON public.asset_maintenance_records USING btree (asset_id, maintenance_date DESC) WHERE (deleted_at IS NULL);


--
-- Name: idx_asset_maintenance_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_asset_maintenance_company_id ON public.asset_maintenance_records USING btree (company_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_asset_network_asset_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_asset_network_asset_id ON public.asset_network USING btree (asset_id);


--
-- Name: idx_asset_network_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_asset_network_company_id ON public.asset_network USING btree (company_id);


--
-- Name: idx_asset_software_asset_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_asset_software_asset_id ON public.asset_software_licenses USING btree (asset_id, status) WHERE (deleted_at IS NULL);


--
-- Name: idx_asset_software_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_asset_software_company_id ON public.asset_software_licenses USING btree (company_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_asset_specifications_asset_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_asset_specifications_asset_id ON public.asset_specifications USING btree (asset_id);


--
-- Name: idx_asset_specifications_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_asset_specifications_company_id ON public.asset_specifications USING btree (company_id);


--
-- Name: idx_assets_asset_code; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_assets_asset_code ON public.assets USING btree (company_id, asset_code) WHERE ((asset_code IS NOT NULL) AND (deleted_at IS NULL));


--
-- Name: idx_assets_asset_subtype; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_asset_subtype ON public.assets USING btree (company_id, asset_subtype) WHERE (deleted_at IS NULL);


--
-- Name: idx_assets_category_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_category_id ON public.assets USING btree (category_id);


--
-- Name: idx_assets_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_company_id ON public.assets USING btree (company_id);


--
-- Name: idx_assets_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_deleted_at ON public.assets USING btree (deleted_at) WHERE (deleted_at IS NOT NULL);


--
-- Name: idx_assets_plate_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_plate_number ON public.assets USING btree (company_id, plate_number) WHERE ((plate_number IS NOT NULL) AND (deleted_at IS NULL));


--
-- Name: idx_assets_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_status ON public.assets USING btree (company_id, status);


--
-- Name: idx_audit_logs_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_action ON public.audit_logs USING btree (action);


--
-- Name: idx_audit_logs_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_company ON public.audit_logs USING btree (company_id);


--
-- Name: idx_audit_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_created_at ON public.audit_logs USING btree (created_at DESC);


--
-- Name: idx_audit_logs_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_entity ON public.audit_logs USING btree (entity_type, entity_id);


--
-- Name: idx_audit_logs_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_user_id ON public.audit_logs USING btree (user_id);


--
-- Name: idx_bank_accounts_default; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_bank_accounts_default ON public.entity_bank_accounts USING btree (company_id, currency) WHERE (is_default = true);


--
-- Name: idx_branches_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_branches_company_id ON public.branches USING btree (company_id);


--
-- Name: idx_branches_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_branches_deleted_at ON public.branches USING btree (deleted_at) WHERE (deleted_at IS NOT NULL);


--
-- Name: idx_coa_account_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coa_account_type ON public.chart_of_accounts USING btree (company_id, account_type);


--
-- Name: idx_coa_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coa_company_id ON public.chart_of_accounts USING btree (company_id);


--
-- Name: idx_coa_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coa_deleted_at ON public.chart_of_accounts USING btree (deleted_at) WHERE (deleted_at IS NOT NULL);


--
-- Name: idx_coa_parent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coa_parent_id ON public.chart_of_accounts USING btree (parent_id) WHERE (parent_id IS NOT NULL);


--
-- Name: idx_companies_code; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_companies_code ON public.companies USING btree (code);


--
-- Name: idx_companies_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_companies_is_active ON public.companies USING btree (is_active);


--
-- Name: idx_cost_centers_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cost_centers_company_id ON public.cost_centers USING btree (company_id);


--
-- Name: idx_cost_centers_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cost_centers_deleted_at ON public.cost_centers USING btree (deleted_at) WHERE (deleted_at IS NOT NULL);


--
-- Name: idx_customers_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_active ON public.customers USING btree (active);


--
-- Name: idx_customers_company_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_company_code ON public.customers USING btree (company_id, code) WHERE ((company_id IS NOT NULL) AND (code IS NOT NULL));


--
-- Name: idx_customers_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_company_id ON public.customers USING btree (company_id) WHERE (company_id IS NOT NULL);


--
-- Name: idx_customers_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_deleted_at ON public.customers USING btree (deleted_at) WHERE (deleted_at IS NOT NULL);


--
-- Name: idx_customers_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_name ON public.customers USING btree (name);


--
-- Name: idx_delivery_note_items_dn; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_delivery_note_items_dn ON public.delivery_note_items USING btree (delivery_note_id);


--
-- Name: idx_delivery_notes_picking; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_delivery_notes_picking ON public.delivery_notes USING btree (picking_list_id);


--
-- Name: idx_delivery_notes_sp_no; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_delivery_notes_sp_no ON public.delivery_notes USING btree (sp_no);


--
-- Name: idx_delivery_notes_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_delivery_notes_status ON public.delivery_notes USING btree (status);


--
-- Name: idx_departments_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_departments_company_id ON public.departments USING btree (company_id);


--
-- Name: idx_departments_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_departments_deleted_at ON public.departments USING btree (deleted_at) WHERE (deleted_at IS NOT NULL);


--
-- Name: idx_departments_parent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_departments_parent_id ON public.departments USING btree (parent_id);


--
-- Name: idx_document_sequences_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_document_sequences_company_id ON public.document_sequences USING btree (company_id);


--
-- Name: idx_document_sequences_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_document_sequences_lookup ON public.document_sequences USING btree (company_id, document_type, department_code, year, month);


--
-- Name: idx_document_types_company_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_document_types_company_code ON public.document_types USING btree (company_id, code);


--
-- Name: idx_document_types_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_document_types_company_id ON public.document_types USING btree (company_id);


--
-- Name: idx_dropdown_options_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dropdown_options_group ON public.dropdown_options USING btree (group_key);


--
-- Name: idx_dropdown_options_list; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dropdown_options_list ON public.dropdown_options USING btree (list_key, is_active);


--
-- Name: idx_exchange_rates_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exchange_rates_company_id ON public.exchange_rates USING btree (company_id);


--
-- Name: idx_exchange_rates_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exchange_rates_lookup ON public.exchange_rates USING btree (company_id, from_currency, to_currency, effective_date DESC);


--
-- Name: idx_hrga_approval_configs_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hrga_approval_configs_company ON public.hrga_approval_configs USING btree (company_id);


--
-- Name: idx_hrga_approval_configs_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hrga_approval_configs_type ON public.hrga_approval_configs USING btree (request_type_id) WHERE (is_active = true);


--
-- Name: idx_hrga_notification_queue_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hrga_notification_queue_pending ON public.hrga_notification_queue USING btree (created_at) WHERE ((status)::text = 'pending'::text);


--
-- Name: idx_hrga_notification_queue_request; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hrga_notification_queue_request ON public.hrga_notification_queue USING btree (request_id);


--
-- Name: idx_hrga_offboarding_checklists_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hrga_offboarding_checklists_company ON public.hrga_offboarding_checklists USING btree (company_id) WHERE ((deleted_at IS NULL) AND (is_active = true));


--
-- Name: idx_hrga_offboarding_items_request; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hrga_offboarding_items_request ON public.hrga_offboarding_items USING btree (request_id);


--
-- Name: idx_hrga_request_approvals_approver; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hrga_request_approvals_approver ON public.hrga_request_approvals USING btree (approver_id);


--
-- Name: idx_hrga_request_approvals_request; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hrga_request_approvals_request ON public.hrga_request_approvals USING btree (request_id);


--
-- Name: idx_hrga_request_attachments_request; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hrga_request_attachments_request ON public.hrga_request_attachments USING btree (request_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_hrga_request_items_request; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hrga_request_items_request ON public.hrga_request_items USING btree (request_id);


--
-- Name: idx_hrga_request_types_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hrga_request_types_category ON public.hrga_request_types USING btree (company_id, category_code) WHERE ((deleted_at IS NULL) AND (is_active = true));


--
-- Name: idx_hrga_request_types_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hrga_request_types_company ON public.hrga_request_types USING btree (company_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_hrga_requests_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hrga_requests_company ON public.hrga_requests USING btree (company_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_hrga_requests_company_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hrga_requests_company_created ON public.hrga_requests USING btree (company_id, created_at DESC) WHERE (deleted_at IS NULL);


--
-- Name: idx_hrga_requests_company_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hrga_requests_company_status ON public.hrga_requests USING btree (company_id, status) WHERE (deleted_at IS NULL);


--
-- Name: idx_hrga_requests_current_level; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hrga_requests_current_level ON public.hrga_requests USING btree (company_id, current_level, status) WHERE (deleted_at IS NULL);


--
-- Name: idx_hrga_requests_requester; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hrga_requests_requester ON public.hrga_requests USING btree (requester_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_hrga_requests_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hrga_requests_type ON public.hrga_requests USING btree (request_type_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_inquiries_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inquiries_company_id ON public.inquiries USING btree (company_id);


--
-- Name: idx_inquiries_prospect_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inquiries_prospect_id ON public.inquiries USING btree (prospect_id);


--
-- Name: idx_meeting_moms_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meeting_moms_company ON public.meeting_moms USING btree (company_id);


--
-- Name: idx_meeting_moms_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meeting_moms_created_by ON public.meeting_moms USING btree (created_by);


--
-- Name: idx_meeting_moms_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meeting_moms_status ON public.meeting_moms USING btree (status);


--
-- Name: idx_mom_action_plans_mom_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mom_action_plans_mom_id ON public.mom_action_plans USING btree (mom_id);


--
-- Name: idx_mom_improvements_mom_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mom_improvements_mom_id ON public.mom_improvements USING btree (mom_id);


--
-- Name: idx_mom_issues_mom_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mom_issues_mom_id ON public.mom_issues USING btree (mom_id);


--
-- Name: idx_mom_progress_updates_mom_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mom_progress_updates_mom_id ON public.mom_progress_updates USING btree (mom_id);


--
-- Name: idx_notifications_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_id ON public.notifications USING btree (user_id, is_read, created_at DESC);


--
-- Name: idx_payment_terms_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_terms_company_id ON public.payment_terms USING btree (company_id);


--
-- Name: idx_payment_terms_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_terms_deleted_at ON public.payment_terms USING btree (deleted_at) WHERE (deleted_at IS NOT NULL);


--
-- Name: idx_permissions_module; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_permissions_module ON public.permissions USING btree (module);


--
-- Name: idx_picking_list_items_pl; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_picking_list_items_pl ON public.picking_list_items USING btree (picking_list_id);


--
-- Name: idx_picking_lists_sp_no; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_picking_lists_sp_no ON public.picking_lists USING btree (sp_no);


--
-- Name: idx_picking_lists_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_picking_lists_status ON public.picking_lists USING btree (status);


--
-- Name: idx_plm_picking; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_plm_picking ON public.picking_list_materials USING btree (picking_list_id);


--
-- Name: idx_positions_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_positions_company_id ON public.positions USING btree (company_id);


--
-- Name: idx_positions_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_positions_deleted_at ON public.positions USING btree (deleted_at) WHERE (deleted_at IS NOT NULL);


--
-- Name: idx_pph_product_changed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pph_product_changed ON public.product_price_history USING btree (product_id, changed_at DESC);


--
-- Name: idx_prf_cost_items_prf_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prf_cost_items_prf_id ON public.prf_cost_items USING btree (prf_id);


--
-- Name: idx_products_company_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_company_code ON public.products USING btree (company_id, code);


--
-- Name: idx_products_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_company_id ON public.products USING btree (company_id);


--
-- Name: idx_products_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_deleted_at ON public.products USING btree (deleted_at) WHERE (deleted_at IS NOT NULL);


--
-- Name: idx_profiles_branch_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_branch_id ON public.profiles USING btree (branch_id) WHERE (branch_id IS NOT NULL);


--
-- Name: idx_profiles_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_company_id ON public.profiles USING btree (company_id) WHERE (company_id IS NOT NULL);


--
-- Name: idx_profiles_department_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_department_id ON public.profiles USING btree (department_id) WHERE (department_id IS NOT NULL);


--
-- Name: idx_profiles_reports_to; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_reports_to ON public.profiles USING btree (reports_to);


--
-- Name: idx_prospects_assigned_to; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prospects_assigned_to ON public.accounts USING btree (assigned_to);


--
-- Name: idx_prospects_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prospects_company_id ON public.accounts USING btree (company_id);


--
-- Name: idx_prospects_pipeline_stage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prospects_pipeline_stage ON public.accounts USING btree (pipeline_stage);


--
-- Name: idx_pwl_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pwl_product ON public.product_warehouse_location USING btree (product_id);


--
-- Name: idx_pwl_warehouse; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pwl_warehouse ON public.product_warehouse_location USING btree (warehouse_id);


--
-- Name: idx_quotations_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quotations_company_id ON public.quotations USING btree (company_id);


--
-- Name: idx_quotations_prf_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quotations_prf_id ON public.quotations USING btree (prf_id) WHERE (prf_id IS NOT NULL);


--
-- Name: idx_quotations_prospect_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quotations_prospect_id ON public.quotations USING btree (prospect_id);


--
-- Name: idx_quotations_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quotations_status ON public.quotations USING btree (status);


--
-- Name: idx_role_permissions_permission_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_role_permissions_permission_id ON public.role_permissions USING btree (permission_id);


--
-- Name: idx_role_permissions_role_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_role_permissions_role_id ON public.role_permissions USING btree (role_id);


--
-- Name: idx_roles_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_roles_company_id ON public.roles USING btree (company_id);


--
-- Name: idx_roles_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_roles_deleted_at ON public.roles USING btree (deleted_at) WHERE (deleted_at IS NOT NULL);


--
-- Name: idx_sales_orders_account_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_orders_account_id ON public.sales_orders USING btree (account_id);


--
-- Name: idx_sales_orders_company_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_orders_company_created ON public.sales_orders USING btree (company_id, created_at DESC);


--
-- Name: idx_sp_items_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sp_items_customer_id ON public.sp_items USING btree (customer_id);


--
-- Name: idx_sp_items_sp_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sp_items_sp_date ON public.sp_items USING btree (sp_date DESC NULLS LAST);


--
-- Name: idx_sp_items_sp_no; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sp_items_sp_no ON public.sp_items USING btree (sp_no);


--
-- Name: idx_status_catalog_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_status_catalog_is_active ON public.status_catalog USING btree (is_active);


--
-- Name: idx_stock_ledger_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_ledger_company ON public.stock_ledger USING btree (company_id);


--
-- Name: idx_stock_ledger_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_ledger_created_at ON public.stock_ledger USING btree (created_at DESC);


--
-- Name: idx_stock_ledger_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_ledger_product ON public.stock_ledger USING btree (product_id);


--
-- Name: idx_stock_ledger_warehouse; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_ledger_warehouse ON public.stock_ledger USING btree (warehouse_id);


--
-- Name: idx_taxes_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_taxes_company_id ON public.taxes USING btree (company_id);


--
-- Name: idx_taxes_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_taxes_deleted_at ON public.taxes USING btree (deleted_at) WHERE (deleted_at IS NOT NULL);


--
-- Name: idx_user_login_logs_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_login_logs_time ON public.user_login_logs USING btree (logged_in_at DESC);


--
-- Name: idx_user_login_logs_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_login_logs_user ON public.user_login_logs USING btree (user_id);


--
-- Name: idx_user_roles_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_roles_company_id ON public.user_roles USING btree (company_id);


--
-- Name: idx_user_roles_role_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_roles_role_id ON public.user_roles USING btree (role_id);


--
-- Name: idx_user_roles_user_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_roles_user_company ON public.user_roles USING btree (user_id, company_id) WHERE (is_active = true);


--
-- Name: idx_user_roles_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_roles_user_id ON public.user_roles USING btree (user_id);


--
-- Name: idx_vendors_company_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vendors_company_code ON public.vendors USING btree (company_id, code);


--
-- Name: idx_vendors_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vendors_company_id ON public.vendors USING btree (company_id);


--
-- Name: idx_vendors_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vendors_deleted_at ON public.vendors USING btree (deleted_at) WHERE (deleted_at IS NOT NULL);


--
-- Name: idx_vendors_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vendors_is_active ON public.vendors USING btree (is_active);


--
-- Name: sales_orders_inquiry_unique_live; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX sales_orders_inquiry_unique_live ON public.sales_orders USING btree (inquiry_id) WHERE (deleted_at IS NULL);


--
-- Name: sp_btb_no_unique_live; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX sp_btb_no_unique_live ON public.sp_btb USING btree (customer_id, btb_no) WHERE (deleted_at IS NULL);


--
-- Name: hrga_approval_configs set_hrga_approval_configs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_hrga_approval_configs_updated_at BEFORE UPDATE ON public.hrga_approval_configs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: hrga_offboarding_checklists set_hrga_offboarding_checklists_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_hrga_offboarding_checklists_updated_at BEFORE UPDATE ON public.hrga_offboarding_checklists FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: hrga_offboarding_items set_hrga_offboarding_items_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_hrga_offboarding_items_updated_at BEFORE UPDATE ON public.hrga_offboarding_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: hrga_request_items set_hrga_request_items_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_hrga_request_items_updated_at BEFORE UPDATE ON public.hrga_request_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: hrga_request_types set_hrga_request_types_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_hrga_request_types_updated_at BEFORE UPDATE ON public.hrga_request_types FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: hrga_requests set_hrga_requests_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_hrga_requests_updated_at BEFORE UPDATE ON public.hrga_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: prf_cost_items set_prf_cost_items_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_prf_cost_items_updated_at BEFORE UPDATE ON public.prf_cost_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: prf set_prf_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_prf_updated_at BEFORE UPDATE ON public.prf FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: sales_orders set_sales_orders_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_sales_orders_updated_at BEFORE UPDATE ON public.sales_orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: approval_delegations trg_approval_delegations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_approval_delegations_updated_at BEFORE UPDATE ON public.approval_delegations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: approval_rules trg_approval_rules_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_approval_rules_updated_at BEFORE UPDATE ON public.approval_rules FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: ar_ttfs trg_ar_ttfs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ar_ttfs_updated_at BEFORE UPDATE ON public.ar_ttfs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: asset_categories trg_asset_categories_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_asset_categories_updated_at BEFORE UPDATE ON public.asset_categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: asset_fuel_logs trg_asset_fuel_logs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_asset_fuel_logs_updated_at BEFORE UPDATE ON public.asset_fuel_logs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: asset_locations trg_asset_locations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_asset_locations_updated_at BEFORE UPDATE ON public.asset_locations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: asset_maintenance_records trg_asset_maintenance_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_asset_maintenance_updated_at BEFORE UPDATE ON public.asset_maintenance_records FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: asset_network trg_asset_network_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_asset_network_updated_at BEFORE UPDATE ON public.asset_network FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: asset_software_licenses trg_asset_software_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_asset_software_updated_at BEFORE UPDATE ON public.asset_software_licenses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: asset_specifications trg_asset_specifications_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_asset_specifications_updated_at BEFORE UPDATE ON public.asset_specifications FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: assets trg_assets_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_assets_updated_at BEFORE UPDATE ON public.assets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: branches trg_branches_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_branches_updated_at BEFORE UPDATE ON public.branches FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: chart_of_accounts trg_chart_of_accounts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_chart_of_accounts_updated_at BEFORE UPDATE ON public.chart_of_accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: companies trg_companies_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_companies_updated_at BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: cost_centers trg_cost_centers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_cost_centers_updated_at BEFORE UPDATE ON public.cost_centers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: currencies trg_currencies_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_currencies_updated_at BEFORE UPDATE ON public.currencies FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: customers trg_customers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: delivery_notes trg_delivery_notes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_delivery_notes_updated_at BEFORE UPDATE ON public.delivery_notes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: departments trg_departments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_departments_updated_at BEFORE UPDATE ON public.departments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: document_sequences trg_document_sequences_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_document_sequences_updated_at BEFORE UPDATE ON public.document_sequences FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: document_types trg_document_types_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_document_types_updated_at BEFORE UPDATE ON public.document_types FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: exchange_rates trg_exchange_rates_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_exchange_rates_updated_at BEFORE UPDATE ON public.exchange_rates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: accounts trg_gen_customer_code_ins; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_gen_customer_code_ins BEFORE INSERT ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.generate_customer_code();


--
-- Name: quotations trg_inquiry_quoted; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_inquiry_quoted AFTER INSERT OR UPDATE OF status ON public.quotations FOR EACH ROW EXECUTE FUNCTION public.set_inquiry_quoted_on_quotation_sent();


--
-- Name: prf trg_inquiry_review; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_inquiry_review AFTER INSERT OR UPDATE OF status ON public.prf FOR EACH ROW EXECUTE FUNCTION public.set_inquiry_review_on_prf_submit();


--
-- Name: sales_orders trg_inquiry_won; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_inquiry_won AFTER INSERT OR UPDATE ON public.sales_orders FOR EACH ROW EXECUTE FUNCTION public.set_inquiry_won_on_so();


--
-- Name: payment_terms trg_payment_terms_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_payment_terms_updated_at BEFORE UPDATE ON public.payment_terms FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: picking_lists trg_picking_lists_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_picking_lists_updated_at BEFORE UPDATE ON public.picking_lists FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: positions trg_positions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_positions_updated_at BEFORE UPDATE ON public.positions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: product_warehouse_location trg_product_warehouse_location_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_product_warehouse_location_updated_at BEFORE UPDATE ON public.product_warehouse_location FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: products trg_products_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: profiles trg_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: quotations trg_quotation_prf_consistency; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_quotation_prf_consistency BEFORE INSERT OR UPDATE ON public.quotations FOR EACH ROW EXECUTE FUNCTION public.guard_quotation_prf_consistency();


--
-- Name: roles trg_roles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_roles_updated_at BEFORE UPDATE ON public.roles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: inquiries trg_set_customer_on_inquiry_won; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_customer_on_inquiry_won AFTER INSERT OR UPDATE ON public.inquiries FOR EACH ROW EXECUTE FUNCTION public.set_customer_on_inquiry_won();


--
-- Name: accounts trg_set_customer_on_won; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_customer_on_won BEFORE INSERT OR UPDATE ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.set_customer_on_won();


--
-- Name: inquiries trg_set_prospect_on_inquiry; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_prospect_on_inquiry AFTER INSERT ON public.inquiries FOR EACH ROW EXECUTE FUNCTION public.set_prospect_on_inquiry();


--
-- Name: sp_items trg_sp_items_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sp_items_updated_at BEFORE UPDATE ON public.sp_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: status_catalog trg_status_catalog_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_status_catalog_updated_at BEFORE UPDATE ON public.status_catalog FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: taxes trg_taxes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_taxes_updated_at BEFORE UPDATE ON public.taxes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: vendors trg_vendors_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_vendors_updated_at BEFORE UPDATE ON public.vendors FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: warehouses trg_warehouses_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_warehouses_updated_at BEFORE UPDATE ON public.warehouses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: accounts trg_z_gen_customer_code_upd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_z_gen_customer_code_upd BEFORE UPDATE ON public.accounts FOR EACH ROW WHEN ((((new.code IS NULL) OR (new.code = ''::text)) AND (new.deleted_at IS NULL))) EXECUTE FUNCTION public.generate_customer_code();


--
-- Name: products trg_z_products_price_history; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_z_products_price_history AFTER UPDATE OF default_price ON public.products FOR EACH ROW WHEN ((old.default_price IS DISTINCT FROM new.default_price)) EXECUTE FUNCTION public.log_product_price_change();


--
-- Name: quotations trg_z_sync_deal_value_on_quotation_accept; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_z_sync_deal_value_on_quotation_accept AFTER UPDATE ON public.quotations FOR EACH ROW EXECUTE FUNCTION public.sync_deal_value_on_quotation_accept();


--
-- Name: activities trg_z_sync_last_activity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_z_sync_last_activity AFTER INSERT OR DELETE OR UPDATE ON public.activities FOR EACH ROW EXECUTE FUNCTION public.sync_last_activity_on_account();


--
-- Name: profiles trg_z_sync_profile_email; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_z_sync_profile_email BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.sync_profile_email();


--
-- Name: accounts trg_z_track_stage_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_z_track_stage_change BEFORE UPDATE ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.track_stage_change();


--
-- Name: accounts accounts_pull_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_pull_approved_by_fkey FOREIGN KEY (pull_approved_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: activities activities_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activities
    ADD CONSTRAINT activities_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id);


--
-- Name: activities activities_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activities
    ADD CONSTRAINT activities_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: activities activities_inquiry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activities
    ADD CONSTRAINT activities_inquiry_id_fkey FOREIGN KEY (inquiry_id) REFERENCES public.inquiries(id);


--
-- Name: activities activities_quotation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activities
    ADD CONSTRAINT activities_quotation_id_fkey FOREIGN KEY (quotation_id) REFERENCES public.quotations(id);


--
-- Name: activity_logs activity_logs_activity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_logs
    ADD CONSTRAINT activity_logs_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES public.activities(id) ON DELETE CASCADE;


--
-- Name: app_settings app_settings_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: app_settings app_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: approval_delegations approval_delegations_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_delegations
    ADD CONSTRAINT approval_delegations_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES auth.users(id);


--
-- Name: approval_delegations approval_delegations_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_delegations
    ADD CONSTRAINT approval_delegations_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;


--
-- Name: approval_delegations approval_delegations_delegate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_delegations
    ADD CONSTRAINT approval_delegations_delegate_id_fkey FOREIGN KEY (delegate_id) REFERENCES auth.users(id);


--
-- Name: approval_delegations approval_delegations_delegator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_delegations
    ADD CONSTRAINT approval_delegations_delegator_id_fkey FOREIGN KEY (delegator_id) REFERENCES auth.users(id);


--
-- Name: approval_logs approval_logs_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_logs
    ADD CONSTRAINT approval_logs_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES auth.users(id);


--
-- Name: approval_logs approval_logs_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_logs
    ADD CONSTRAINT approval_logs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;


--
-- Name: approval_rules approval_rules_approver_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_rules
    ADD CONSTRAINT approval_rules_approver_role_id_fkey FOREIGN KEY (approver_role_id) REFERENCES public.roles(id);


--
-- Name: approval_rules approval_rules_approver_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_rules
    ADD CONSTRAINT approval_rules_approver_user_id_fkey FOREIGN KEY (approver_user_id) REFERENCES auth.users(id);


--
-- Name: approval_rules approval_rules_backup_approver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_rules
    ADD CONSTRAINT approval_rules_backup_approver_id_fkey FOREIGN KEY (backup_approver_id) REFERENCES auth.users(id);


--
-- Name: approval_rules approval_rules_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_rules
    ADD CONSTRAINT approval_rules_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;


--
-- Name: approval_rules approval_rules_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_rules
    ADD CONSTRAINT approval_rules_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: approval_rules approval_rules_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_rules
    ADD CONSTRAINT approval_rules_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id);


--
-- Name: approval_workflow_steps approval_workflow_steps_approver_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_workflow_steps
    ADD CONSTRAINT approval_workflow_steps_approver_user_id_fkey FOREIGN KEY (approver_user_id) REFERENCES auth.users(id);


--
-- Name: approval_workflow_steps approval_workflow_steps_workflow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_workflow_steps
    ADD CONSTRAINT approval_workflow_steps_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.approval_workflows(id) ON DELETE CASCADE;


--
-- Name: approval_workflows approval_workflows_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_workflows
    ADD CONSTRAINT approval_workflows_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: approval_workflows approval_workflows_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_workflows
    ADD CONSTRAINT approval_workflows_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: ar_btbs ar_btbs_ttf_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ar_btbs
    ADD CONSTRAINT ar_btbs_ttf_id_fkey FOREIGN KEY (ttf_id) REFERENCES public.ar_ttfs(id) ON DELETE CASCADE;


--
-- Name: ar_ttfs ar_ttfs_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ar_ttfs
    ADD CONSTRAINT ar_ttfs_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.accounts(id);


--
-- Name: asset_categories asset_categories_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_categories
    ADD CONSTRAINT asset_categories_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;


--
-- Name: asset_categories asset_categories_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_categories
    ADD CONSTRAINT asset_categories_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: asset_fuel_logs asset_fuel_logs_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_fuel_logs
    ADD CONSTRAINT asset_fuel_logs_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE RESTRICT;


--
-- Name: asset_fuel_logs asset_fuel_logs_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_fuel_logs
    ADD CONSTRAINT asset_fuel_logs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;


--
-- Name: asset_fuel_logs asset_fuel_logs_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_fuel_logs
    ADD CONSTRAINT asset_fuel_logs_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: asset_locations asset_locations_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_locations
    ADD CONSTRAINT asset_locations_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: asset_locations asset_locations_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_locations
    ADD CONSTRAINT asset_locations_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;


--
-- Name: asset_locations asset_locations_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_locations
    ADD CONSTRAINT asset_locations_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: asset_maintenance_records asset_maintenance_records_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_maintenance_records
    ADD CONSTRAINT asset_maintenance_records_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE CASCADE;


--
-- Name: asset_maintenance_records asset_maintenance_records_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_maintenance_records
    ADD CONSTRAINT asset_maintenance_records_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: asset_maintenance_records asset_maintenance_records_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_maintenance_records
    ADD CONSTRAINT asset_maintenance_records_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: asset_network asset_network_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_network
    ADD CONSTRAINT asset_network_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE CASCADE;


--
-- Name: asset_network asset_network_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_network
    ADD CONSTRAINT asset_network_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: asset_software_licenses asset_software_licenses_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_software_licenses
    ADD CONSTRAINT asset_software_licenses_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE CASCADE;


--
-- Name: asset_software_licenses asset_software_licenses_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_software_licenses
    ADD CONSTRAINT asset_software_licenses_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: asset_software_licenses asset_software_licenses_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_software_licenses
    ADD CONSTRAINT asset_software_licenses_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: asset_specifications asset_specifications_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_specifications
    ADD CONSTRAINT asset_specifications_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE CASCADE;


--
-- Name: asset_specifications asset_specifications_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_specifications
    ADD CONSTRAINT asset_specifications_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: assets assets_assigned_to_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_assigned_to_user_id_fkey FOREIGN KEY (assigned_to_user_id) REFERENCES auth.users(id);


--
-- Name: assets assets_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.asset_categories(id);


--
-- Name: assets assets_coa_asset_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_coa_asset_account_id_fkey FOREIGN KEY (coa_asset_account_id) REFERENCES public.chart_of_accounts(id);


--
-- Name: assets assets_coa_depreciation_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_coa_depreciation_account_id_fkey FOREIGN KEY (coa_depreciation_account_id) REFERENCES public.chart_of_accounts(id);


--
-- Name: assets assets_coa_expense_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_coa_expense_account_id_fkey FOREIGN KEY (coa_expense_account_id) REFERENCES public.chart_of_accounts(id);


--
-- Name: assets assets_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;


--
-- Name: assets assets_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: assets assets_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id);


--
-- Name: assets assets_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.asset_locations(id);


--
-- Name: assets assets_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);


--
-- Name: audit_logs audit_logs_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL;


--
-- Name: audit_logs audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: branches branches_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;


--
-- Name: branches branches_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: chart_of_accounts chart_of_accounts_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chart_of_accounts
    ADD CONSTRAINT chart_of_accounts_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;


--
-- Name: chart_of_accounts chart_of_accounts_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chart_of_accounts
    ADD CONSTRAINT chart_of_accounts_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: chart_of_accounts chart_of_accounts_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chart_of_accounts
    ADD CONSTRAINT chart_of_accounts_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.chart_of_accounts(id);


--
-- Name: cost_centers cost_centers_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cost_centers
    ADD CONSTRAINT cost_centers_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: cost_centers cost_centers_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cost_centers
    ADD CONSTRAINT cost_centers_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;


--
-- Name: cost_centers cost_centers_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cost_centers
    ADD CONSTRAINT cost_centers_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: cost_centers cost_centers_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cost_centers
    ADD CONSTRAINT cost_centers_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id);


--
-- Name: customers customers_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: customers customers_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: customers customers_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: customers customers_currency_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_currency_code_fkey FOREIGN KEY (currency_code) REFERENCES public.currencies(code);


--
-- Name: customers customers_payment_terms_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_payment_terms_id_fkey FOREIGN KEY (payment_terms_id) REFERENCES public.payment_terms(id);


--
-- Name: customers customers_prospect_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_prospect_id_fkey FOREIGN KEY (prospect_id) REFERENCES public.accounts(id) ON DELETE SET NULL;


--
-- Name: customers customers_source_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_source_company_id_fkey FOREIGN KEY (source_company_id) REFERENCES public.companies(id) ON DELETE SET NULL;


--
-- Name: customers customers_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);


--
-- Name: dc_master dc_master_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dc_master
    ADD CONSTRAINT dc_master_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: dc_master dc_master_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dc_master
    ADD CONSTRAINT dc_master_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.accounts(id);


--
-- Name: deal_handovers deal_handovers_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_handovers
    ADD CONSTRAINT deal_handovers_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- Name: deal_handovers deal_handovers_approved_by_finance_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_handovers
    ADD CONSTRAINT deal_handovers_approved_by_finance_fkey FOREIGN KEY (approved_by_finance) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: deal_handovers deal_handovers_approved_by_ops_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_handovers
    ADD CONSTRAINT deal_handovers_approved_by_ops_fkey FOREIGN KEY (approved_by_ops) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: deal_handovers deal_handovers_approved_by_sales_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_handovers
    ADD CONSTRAINT deal_handovers_approved_by_sales_fkey FOREIGN KEY (approved_by_sales) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: deal_handovers deal_handovers_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_handovers
    ADD CONSTRAINT deal_handovers_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: deal_handovers deal_handovers_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_handovers
    ADD CONSTRAINT deal_handovers_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: deal_handovers deal_handovers_kam_assigned_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_handovers
    ADD CONSTRAINT deal_handovers_kam_assigned_fkey FOREIGN KEY (kam_assigned) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: delivery_note_items delivery_note_items_delivery_note_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_note_items
    ADD CONSTRAINT delivery_note_items_delivery_note_id_fkey FOREIGN KEY (delivery_note_id) REFERENCES public.delivery_notes(id) ON DELETE CASCADE;


--
-- Name: delivery_note_items delivery_note_items_picking_list_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_note_items
    ADD CONSTRAINT delivery_note_items_picking_list_item_id_fkey FOREIGN KEY (picking_list_item_id) REFERENCES public.picking_list_items(id) ON DELETE SET NULL;


--
-- Name: delivery_note_items delivery_note_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_note_items
    ADD CONSTRAINT delivery_note_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: delivery_note_items delivery_note_items_sp_order_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_note_items
    ADD CONSTRAINT delivery_note_items_sp_order_item_id_fkey FOREIGN KEY (sp_order_item_id) REFERENCES public.sp_order_items(id) ON DELETE SET NULL;


--
-- Name: delivery_notes delivery_notes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_notes
    ADD CONSTRAINT delivery_notes_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: delivery_notes delivery_notes_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_notes
    ADD CONSTRAINT delivery_notes_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.accounts(id);


--
-- Name: delivery_notes delivery_notes_picking_list_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_notes
    ADD CONSTRAINT delivery_notes_picking_list_id_fkey FOREIGN KEY (picking_list_id) REFERENCES public.picking_lists(id);


--
-- Name: delivery_notes delivery_notes_sp_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_notes
    ADD CONSTRAINT delivery_notes_sp_order_id_fkey FOREIGN KEY (sp_order_id) REFERENCES public.sp_orders(id);


--
-- Name: departments departments_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;


--
-- Name: departments departments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: departments departments_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.departments(id);


--
-- Name: document_numbering document_numbering_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_numbering
    ADD CONSTRAINT document_numbering_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: document_numbering document_numbering_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_numbering
    ADD CONSTRAINT document_numbering_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: document_sequences document_sequences_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_sequences
    ADD CONSTRAINT document_sequences_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;


--
-- Name: document_templates document_templates_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_templates
    ADD CONSTRAINT document_templates_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: document_templates document_templates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_templates
    ADD CONSTRAINT document_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: document_types document_types_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_types
    ADD CONSTRAINT document_types_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;


--
-- Name: document_types document_types_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_types
    ADD CONSTRAINT document_types_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: dropdown_options dropdown_options_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dropdown_options
    ADD CONSTRAINT dropdown_options_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: entity_bank_accounts entity_bank_accounts_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_bank_accounts
    ADD CONSTRAINT entity_bank_accounts_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: entity_bank_accounts entity_bank_accounts_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_bank_accounts
    ADD CONSTRAINT entity_bank_accounts_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: entity_finance_settings entity_finance_settings_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_finance_settings
    ADD CONSTRAINT entity_finance_settings_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: entity_finance_settings entity_finance_settings_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_finance_settings
    ADD CONSTRAINT entity_finance_settings_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: entity_signatories entity_signatories_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_signatories
    ADD CONSTRAINT entity_signatories_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: entity_signatories entity_signatories_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_signatories
    ADD CONSTRAINT entity_signatories_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: exchange_rates exchange_rates_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_rates
    ADD CONSTRAINT exchange_rates_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;


--
-- Name: exchange_rates exchange_rates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_rates
    ADD CONSTRAINT exchange_rates_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: exchange_rates exchange_rates_from_currency_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_rates
    ADD CONSTRAINT exchange_rates_from_currency_fkey FOREIGN KEY (from_currency) REFERENCES public.currencies(code);


--
-- Name: exchange_rates exchange_rates_to_currency_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_rates
    ADD CONSTRAINT exchange_rates_to_currency_fkey FOREIGN KEY (to_currency) REFERENCES public.currencies(code);


--
-- Name: products fk_products_cogs_account; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT fk_products_cogs_account FOREIGN KEY (cogs_account_id) REFERENCES public.chart_of_accounts(id);


--
-- Name: products fk_products_revenue_account; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT fk_products_revenue_account FOREIGN KEY (revenue_account_id) REFERENCES public.chart_of_accounts(id);


--
-- Name: profiles fk_profiles_position_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT fk_profiles_position_id FOREIGN KEY (position_id) REFERENCES public.positions(id);


--
-- Name: taxes fk_taxes_gl_account; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.taxes
    ADD CONSTRAINT fk_taxes_gl_account FOREIGN KEY (gl_account_id) REFERENCES public.chart_of_accounts(id);


--
-- Name: hrga_approval_configs hrga_approval_configs_approver_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hrga_approval_configs
    ADD CONSTRAINT hrga_approval_configs_approver_user_id_fkey FOREIGN KEY (approver_user_id) REFERENCES auth.users(id);


--
-- Name: hrga_approval_configs hrga_approval_configs_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hrga_approval_configs
    ADD CONSTRAINT hrga_approval_configs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: hrga_approval_configs hrga_approval_configs_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hrga_approval_configs
    ADD CONSTRAINT hrga_approval_configs_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: hrga_approval_configs hrga_approval_configs_request_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hrga_approval_configs
    ADD CONSTRAINT hrga_approval_configs_request_type_id_fkey FOREIGN KEY (request_type_id) REFERENCES public.hrga_request_types(id);


--
-- Name: hrga_notification_queue hrga_notification_queue_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hrga_notification_queue
    ADD CONSTRAINT hrga_notification_queue_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: hrga_notification_queue hrga_notification_queue_recipient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hrga_notification_queue
    ADD CONSTRAINT hrga_notification_queue_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES auth.users(id);


--
-- Name: hrga_notification_queue hrga_notification_queue_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hrga_notification_queue
    ADD CONSTRAINT hrga_notification_queue_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.hrga_requests(id);


--
-- Name: hrga_offboarding_checklists hrga_offboarding_checklists_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hrga_offboarding_checklists
    ADD CONSTRAINT hrga_offboarding_checklists_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: hrga_offboarding_checklists hrga_offboarding_checklists_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hrga_offboarding_checklists
    ADD CONSTRAINT hrga_offboarding_checklists_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: hrga_offboarding_checklists hrga_offboarding_checklists_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hrga_offboarding_checklists
    ADD CONSTRAINT hrga_offboarding_checklists_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);


--
-- Name: hrga_offboarding_items hrga_offboarding_items_checklist_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hrga_offboarding_items
    ADD CONSTRAINT hrga_offboarding_items_checklist_id_fkey FOREIGN KEY (checklist_id) REFERENCES public.hrga_offboarding_checklists(id);


--
-- Name: hrga_offboarding_items hrga_offboarding_items_completed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hrga_offboarding_items
    ADD CONSTRAINT hrga_offboarding_items_completed_by_fkey FOREIGN KEY (completed_by) REFERENCES auth.users(id);


--
-- Name: hrga_offboarding_items hrga_offboarding_items_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hrga_offboarding_items
    ADD CONSTRAINT hrga_offboarding_items_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.hrga_requests(id) ON DELETE CASCADE;


--
-- Name: hrga_request_approvals hrga_request_approvals_approver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hrga_request_approvals
    ADD CONSTRAINT hrga_request_approvals_approver_id_fkey FOREIGN KEY (approver_id) REFERENCES auth.users(id);


--
-- Name: hrga_request_approvals hrga_request_approvals_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hrga_request_approvals
    ADD CONSTRAINT hrga_request_approvals_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.hrga_requests(id);


--
-- Name: hrga_request_attachments hrga_request_attachments_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hrga_request_attachments
    ADD CONSTRAINT hrga_request_attachments_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.hrga_requests(id);


--
-- Name: hrga_request_attachments hrga_request_attachments_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hrga_request_attachments
    ADD CONSTRAINT hrga_request_attachments_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id);


--
-- Name: hrga_request_items hrga_request_items_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hrga_request_items
    ADD CONSTRAINT hrga_request_items_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.hrga_requests(id) ON DELETE CASCADE;


--
-- Name: hrga_request_types hrga_request_types_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hrga_request_types
    ADD CONSTRAINT hrga_request_types_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: hrga_request_types hrga_request_types_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hrga_request_types
    ADD CONSTRAINT hrga_request_types_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: hrga_request_types hrga_request_types_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hrga_request_types
    ADD CONSTRAINT hrga_request_types_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);


--
-- Name: hrga_requests hrga_requests_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hrga_requests
    ADD CONSTRAINT hrga_requests_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: hrga_requests hrga_requests_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hrga_requests
    ADD CONSTRAINT hrga_requests_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: hrga_requests hrga_requests_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hrga_requests
    ADD CONSTRAINT hrga_requests_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: hrga_requests hrga_requests_currency_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hrga_requests
    ADD CONSTRAINT hrga_requests_currency_code_fkey FOREIGN KEY (currency_code) REFERENCES public.currencies(code);


--
-- Name: hrga_requests hrga_requests_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hrga_requests
    ADD CONSTRAINT hrga_requests_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id);


--
-- Name: hrga_requests hrga_requests_request_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hrga_requests
    ADD CONSTRAINT hrga_requests_request_type_id_fkey FOREIGN KEY (request_type_id) REFERENCES public.hrga_request_types(id);


--
-- Name: hrga_requests hrga_requests_requester_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hrga_requests
    ADD CONSTRAINT hrga_requests_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES auth.users(id);


--
-- Name: hrga_requests hrga_requests_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hrga_requests
    ADD CONSTRAINT hrga_requests_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);


--
-- Name: inquiries inquiries_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inquiries
    ADD CONSTRAINT inquiries_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: inquiries inquiries_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inquiries
    ADD CONSTRAINT inquiries_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: inquiries inquiries_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inquiries
    ADD CONSTRAINT inquiries_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.accounts(id);


--
-- Name: inquiries inquiries_prospect_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inquiries
    ADD CONSTRAINT inquiries_prospect_id_fkey FOREIGN KEY (prospect_id) REFERENCES public.accounts(id);


--
-- Name: meeting_moms meeting_moms_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_moms
    ADD CONSTRAINT meeting_moms_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: meeting_moms meeting_moms_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_moms
    ADD CONSTRAINT meeting_moms_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: meeting_moms meeting_moms_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_moms
    ADD CONSTRAINT meeting_moms_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: meeting_moms meeting_moms_notulis_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_moms
    ADD CONSTRAINT meeting_moms_notulis_id_fkey FOREIGN KEY (notulis_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: menu_actions menu_actions_menu_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_actions
    ADD CONSTRAINT menu_actions_menu_id_fkey FOREIGN KEY (menu_id) REFERENCES public.module_menus(id) ON DELETE CASCADE;


--
-- Name: module_actions module_actions_module_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.module_actions
    ADD CONSTRAINT module_actions_module_id_fkey FOREIGN KEY (module_id) REFERENCES public.modules(id) ON DELETE CASCADE;


--
-- Name: module_menus module_menus_module_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.module_menus
    ADD CONSTRAINT module_menus_module_id_fkey FOREIGN KEY (module_id) REFERENCES public.modules(id) ON DELETE CASCADE;


--
-- Name: mom_action_plans mom_action_plans_mom_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mom_action_plans
    ADD CONSTRAINT mom_action_plans_mom_id_fkey FOREIGN KEY (mom_id) REFERENCES public.meeting_moms(id) ON DELETE CASCADE;


--
-- Name: mom_improvements mom_improvements_mom_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mom_improvements
    ADD CONSTRAINT mom_improvements_mom_id_fkey FOREIGN KEY (mom_id) REFERENCES public.meeting_moms(id) ON DELETE CASCADE;


--
-- Name: mom_issues mom_issues_mom_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mom_issues
    ADD CONSTRAINT mom_issues_mom_id_fkey FOREIGN KEY (mom_id) REFERENCES public.meeting_moms(id) ON DELETE CASCADE;


--
-- Name: mom_progress_updates mom_progress_updates_mom_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mom_progress_updates
    ADD CONSTRAINT mom_progress_updates_mom_id_fkey FOREIGN KEY (mom_id) REFERENCES public.meeting_moms(id) ON DELETE CASCADE;


--
-- Name: notification_rules notification_rules_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_rules
    ADD CONSTRAINT notification_rules_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: notification_rules notification_rules_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_rules
    ADD CONSTRAINT notification_rules_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: notification_rules notification_rules_recipient_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_rules
    ADD CONSTRAINT notification_rules_recipient_user_id_fkey FOREIGN KEY (recipient_user_id) REFERENCES auth.users(id);


--
-- Name: notifications notifications_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: payment_terms payment_terms_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_terms
    ADD CONSTRAINT payment_terms_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;


--
-- Name: payment_terms payment_terms_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_terms
    ADD CONSTRAINT payment_terms_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: picking_list_items picking_list_items_picking_list_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.picking_list_items
    ADD CONSTRAINT picking_list_items_picking_list_id_fkey FOREIGN KEY (picking_list_id) REFERENCES public.picking_lists(id) ON DELETE CASCADE;


--
-- Name: picking_list_items picking_list_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.picking_list_items
    ADD CONSTRAINT picking_list_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: picking_list_items picking_list_items_sp_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.picking_list_items
    ADD CONSTRAINT picking_list_items_sp_item_id_fkey FOREIGN KEY (sp_item_id) REFERENCES public.sp_items(id) ON DELETE SET NULL;


--
-- Name: picking_list_materials picking_list_materials_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.picking_list_materials
    ADD CONSTRAINT picking_list_materials_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: picking_list_materials picking_list_materials_picking_list_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.picking_list_materials
    ADD CONSTRAINT picking_list_materials_picking_list_id_fkey FOREIGN KEY (picking_list_id) REFERENCES public.picking_lists(id) ON DELETE CASCADE;


--
-- Name: picking_list_materials picking_list_materials_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.picking_list_materials
    ADD CONSTRAINT picking_list_materials_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: picking_lists picking_lists_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.picking_lists
    ADD CONSTRAINT picking_lists_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES auth.users(id);


--
-- Name: picking_lists picking_lists_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.picking_lists
    ADD CONSTRAINT picking_lists_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: picking_lists picking_lists_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.picking_lists
    ADD CONSTRAINT picking_lists_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.accounts(id);


--
-- Name: picking_lists picking_lists_sp_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.picking_lists
    ADD CONSTRAINT picking_lists_sp_order_id_fkey FOREIGN KEY (sp_order_id) REFERENCES public.sp_orders(id);


--
-- Name: picking_lists picking_lists_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.picking_lists
    ADD CONSTRAINT picking_lists_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id);


--
-- Name: positions positions_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.positions
    ADD CONSTRAINT positions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;


--
-- Name: positions positions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.positions
    ADD CONSTRAINT positions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: positions positions_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.positions
    ADD CONSTRAINT positions_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id);


--
-- Name: product_price_history pph_product_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_price_history
    ADD CONSTRAINT pph_product_fk FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: prf prf_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prf
    ADD CONSTRAINT prf_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id);


--
-- Name: prf prf_acknowledged_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prf
    ADD CONSTRAINT prf_acknowledged_by_fkey FOREIGN KEY (acknowledged_by) REFERENCES public.profiles(id);


--
-- Name: prf prf_answered_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prf
    ADD CONSTRAINT prf_answered_by_fkey FOREIGN KEY (answered_by) REFERENCES public.profiles(id);


--
-- Name: prf prf_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prf
    ADD CONSTRAINT prf_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: prf_cost_items prf_cost_items_currency_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prf_cost_items
    ADD CONSTRAINT prf_cost_items_currency_fkey FOREIGN KEY (currency) REFERENCES public.currencies(code);


--
-- Name: prf_cost_items prf_cost_items_prf_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prf_cost_items
    ADD CONSTRAINT prf_cost_items_prf_id_fkey FOREIGN KEY (prf_id) REFERENCES public.prf(id) ON DELETE CASCADE;


--
-- Name: prf_cost_items prf_cost_items_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prf_cost_items
    ADD CONSTRAINT prf_cost_items_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(id);


--
-- Name: prf prf_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prf
    ADD CONSTRAINT prf_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: prf prf_inquiry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prf
    ADD CONSTRAINT prf_inquiry_id_fkey FOREIGN KEY (inquiry_id) REFERENCES public.inquiries(id);


--
-- Name: prf prf_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prf
    ADD CONSTRAINT prf_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id);


--
-- Name: products products_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;


--
-- Name: products products_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: products products_tax_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_tax_id_fkey FOREIGN KEY (tax_id) REFERENCES public.taxes(id);


--
-- Name: products products_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);


--
-- Name: profiles profiles_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: profiles profiles_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: profiles profiles_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id);


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_reports_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_reports_to_fkey FOREIGN KEY (reports_to) REFERENCES public.profiles(id);


--
-- Name: accounts prospects_assigned_profile_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT prospects_assigned_profile_fkey FOREIGN KEY (assigned_profile) REFERENCES public.profiles(id);


--
-- Name: accounts prospects_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT prospects_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.profiles(id);


--
-- Name: accounts prospects_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT prospects_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: accounts prospects_converted_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT prospects_converted_to_fkey FOREIGN KEY (converted_to) REFERENCES public.accounts(id);


--
-- Name: accounts prospects_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT prospects_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: accounts prospects_owner_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT prospects_owner_company_id_fkey FOREIGN KEY (owner_company_id) REFERENCES public.companies(id);


--
-- Name: accounts prospects_payment_terms_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT prospects_payment_terms_id_fkey FOREIGN KEY (payment_terms_id) REFERENCES public.payment_terms(id);


--
-- Name: accounts prospects_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT prospects_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id);


--
-- Name: product_warehouse_location pwl_product_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_warehouse_location
    ADD CONSTRAINT pwl_product_fk FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_warehouse_location pwl_warehouse_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_warehouse_location
    ADD CONSTRAINT pwl_warehouse_fk FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE CASCADE;


--
-- Name: quotation_items quotation_items_quotation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotation_items
    ADD CONSTRAINT quotation_items_quotation_id_fkey FOREIGN KEY (quotation_id) REFERENCES public.quotations(id) ON DELETE CASCADE;


--
-- Name: quotations quotations_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotations
    ADD CONSTRAINT quotations_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: quotations quotations_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotations
    ADD CONSTRAINT quotations_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: quotations quotations_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotations
    ADD CONSTRAINT quotations_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.accounts(id);


--
-- Name: quotations quotations_inquiry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotations
    ADD CONSTRAINT quotations_inquiry_id_fkey FOREIGN KEY (inquiry_id) REFERENCES public.inquiries(id);


--
-- Name: quotations quotations_payment_terms_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotations
    ADD CONSTRAINT quotations_payment_terms_id_fkey FOREIGN KEY (payment_terms_id) REFERENCES public.payment_terms(id);


--
-- Name: quotations quotations_prf_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotations
    ADD CONSTRAINT quotations_prf_id_fkey FOREIGN KEY (prf_id) REFERENCES public.prf(id);


--
-- Name: quotations quotations_prospect_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotations
    ADD CONSTRAINT quotations_prospect_id_fkey FOREIGN KEY (prospect_id) REFERENCES public.accounts(id);


--
-- Name: quotations quotations_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotations
    ADD CONSTRAINT quotations_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id);


--
-- Name: rate_sheets rate_sheets_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rate_sheets
    ADD CONSTRAINT rate_sheets_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: rate_sheets rate_sheets_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rate_sheets
    ADD CONSTRAINT rate_sheets_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: role_permission_templates role_permission_templates_menu_action_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permission_templates
    ADD CONSTRAINT role_permission_templates_menu_action_id_fkey FOREIGN KEY (menu_action_id) REFERENCES public.menu_actions(id) ON DELETE CASCADE;


--
-- Name: role_permission_templates role_permission_templates_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permission_templates
    ADD CONSTRAINT role_permission_templates_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: role_permissions role_permissions_granted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES auth.users(id);


--
-- Name: role_permissions role_permissions_permission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_permission_id_fkey FOREIGN KEY (permission_id) REFERENCES public.permissions(id) ON DELETE CASCADE;


--
-- Name: role_permissions role_permissions_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: roles roles_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;


--
-- Name: roles roles_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: sales_calls sales_calls_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_calls
    ADD CONSTRAINT sales_calls_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: sales_calls sales_calls_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_calls
    ADD CONSTRAINT sales_calls_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: sales_calls sales_calls_prospect_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_calls
    ADD CONSTRAINT sales_calls_prospect_id_fkey FOREIGN KEY (prospect_id) REFERENCES public.accounts(id) ON DELETE SET NULL;


--
-- Name: sales_calls sales_calls_salesperson_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_calls
    ADD CONSTRAINT sales_calls_salesperson_id_fkey FOREIGN KEY (salesperson_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: sales_orders sales_orders_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_orders
    ADD CONSTRAINT sales_orders_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id);


--
-- Name: sales_orders sales_orders_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_orders
    ADD CONSTRAINT sales_orders_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: sales_orders sales_orders_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_orders
    ADD CONSTRAINT sales_orders_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: sales_orders sales_orders_inquiry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_orders
    ADD CONSTRAINT sales_orders_inquiry_id_fkey FOREIGN KEY (inquiry_id) REFERENCES public.inquiries(id);


--
-- Name: sales_orders sales_orders_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_orders
    ADD CONSTRAINT sales_orders_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id);


--
-- Name: sales_visit_logs sales_visit_logs_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_visit_logs
    ADD CONSTRAINT sales_visit_logs_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.profiles(id);


--
-- Name: sales_visit_logs sales_visit_logs_visit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_visit_logs
    ADD CONSTRAINT sales_visit_logs_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES public.sales_visits(id) ON DELETE CASCADE;


--
-- Name: sales_visits sales_visits_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_visits
    ADD CONSTRAINT sales_visits_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: sales_visits sales_visits_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_visits
    ADD CONSTRAINT sales_visits_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: sales_visits sales_visits_prospect_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_visits
    ADD CONSTRAINT sales_visits_prospect_id_fkey FOREIGN KEY (prospect_id) REFERENCES public.accounts(id) ON DELETE SET NULL;


--
-- Name: sales_visits sales_visits_salesperson_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_visits
    ADD CONSTRAINT sales_visits_salesperson_id_fkey FOREIGN KEY (salesperson_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: sp_btb sp_btb_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sp_btb
    ADD CONSTRAINT sp_btb_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: sp_btb sp_btb_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sp_btb
    ADD CONSTRAINT sp_btb_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.accounts(id);


--
-- Name: sp_btb sp_btb_delivery_note_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sp_btb
    ADD CONSTRAINT sp_btb_delivery_note_id_fkey FOREIGN KEY (delivery_note_id) REFERENCES public.delivery_notes(id);


--
-- Name: sp_btb sp_btb_sp_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sp_btb
    ADD CONSTRAINT sp_btb_sp_order_id_fkey FOREIGN KEY (sp_order_id) REFERENCES public.sp_orders(id);


--
-- Name: sp_items sp_items_cancelled_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sp_items
    ADD CONSTRAINT sp_items_cancelled_by_fkey FOREIGN KEY (cancelled_by) REFERENCES auth.users(id);


--
-- Name: sp_items sp_items_confirmed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sp_items
    ADD CONSTRAINT sp_items_confirmed_by_fkey FOREIGN KEY (confirmed_by) REFERENCES auth.users(id);


--
-- Name: sp_items sp_items_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sp_items
    ADD CONSTRAINT sp_items_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.accounts(id);


--
-- Name: sp_items sp_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sp_items
    ADD CONSTRAINT sp_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: sp_order_items sp_order_items_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sp_order_items
    ADD CONSTRAINT sp_order_items_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: sp_order_items sp_order_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sp_order_items
    ADD CONSTRAINT sp_order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: sp_order_items sp_order_items_sp_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sp_order_items
    ADD CONSTRAINT sp_order_items_sp_order_id_fkey FOREIGN KEY (sp_order_id) REFERENCES public.sp_orders(id) ON DELETE CASCADE;


--
-- Name: sp_orders sp_orders_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sp_orders
    ADD CONSTRAINT sp_orders_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: sp_orders sp_orders_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sp_orders
    ADD CONSTRAINT sp_orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.accounts(id);


--
-- Name: sp_orders sp_orders_dc_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sp_orders
    ADD CONSTRAINT sp_orders_dc_id_fkey FOREIGN KEY (dc_id) REFERENCES public.dc_master(id);


--
-- Name: stock_ledger stock_ledger_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_ledger
    ADD CONSTRAINT stock_ledger_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;


--
-- Name: stock_ledger stock_ledger_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_ledger
    ADD CONSTRAINT stock_ledger_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: stock_ledger stock_ledger_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_ledger
    ADD CONSTRAINT stock_ledger_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;


--
-- Name: stock_ledger stock_ledger_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_ledger
    ADD CONSTRAINT stock_ledger_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE RESTRICT;


--
-- Name: taxes taxes_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.taxes
    ADD CONSTRAINT taxes_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;


--
-- Name: taxes taxes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.taxes
    ADD CONSTRAINT taxes_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: top_requests top_requests_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.top_requests
    ADD CONSTRAINT top_requests_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- Name: top_requests top_requests_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.top_requests
    ADD CONSTRAINT top_requests_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: top_requests top_requests_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.top_requests
    ADD CONSTRAINT top_requests_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: top_requests top_requests_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.top_requests
    ADD CONSTRAINT top_requests_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: user_menu_permissions user_menu_permissions_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_menu_permissions
    ADD CONSTRAINT user_menu_permissions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: user_menu_permissions user_menu_permissions_granted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_menu_permissions
    ADD CONSTRAINT user_menu_permissions_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES public.profiles(id);


--
-- Name: user_menu_permissions user_menu_permissions_menu_action_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_menu_permissions
    ADD CONSTRAINT user_menu_permissions_menu_action_id_fkey FOREIGN KEY (menu_action_id) REFERENCES public.menu_actions(id) ON DELETE CASCADE;


--
-- Name: user_menu_permissions user_menu_permissions_module_action_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_menu_permissions
    ADD CONSTRAINT user_menu_permissions_module_action_id_fkey FOREIGN KEY (module_action_id) REFERENCES public.module_actions(id) ON DELETE CASCADE;


--
-- Name: user_menu_permissions user_menu_permissions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_menu_permissions
    ADD CONSTRAINT user_menu_permissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;


--
-- Name: user_roles user_roles_granted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES auth.users(id);


--
-- Name: user_roles user_roles_revoked_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_revoked_by_fkey FOREIGN KEY (revoked_by) REFERENCES auth.users(id);


--
-- Name: user_roles user_roles_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: vendors vendors_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendors
    ADD CONSTRAINT vendors_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;


--
-- Name: vendors vendors_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendors
    ADD CONSTRAINT vendors_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: vendors vendors_currency_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendors
    ADD CONSTRAINT vendors_currency_code_fkey FOREIGN KEY (currency_code) REFERENCES public.currencies(code);


--
-- Name: vendors vendors_payment_terms_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendors
    ADD CONSTRAINT vendors_payment_terms_id_fkey FOREIGN KEY (payment_terms_id) REFERENCES public.payment_terms(id);


--
-- Name: vendors vendors_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendors
    ADD CONSTRAINT vendors_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);


--
-- Name: warehouses warehouses_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouses
    ADD CONSTRAINT warehouses_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;


--
-- Name: accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: accounts_dedup_backup_20260722; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.accounts_dedup_backup_20260722 ENABLE ROW LEVEL SECURITY;

--
-- Name: accounts accounts_delete_superadmin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY accounts_delete_superadmin ON public.accounts FOR DELETE TO authenticated USING (public.is_super_admin());


--
-- Name: accounts_fase3_backup_20260722; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.accounts_fase3_backup_20260722 ENABLE ROW LEVEL SECURITY;

--
-- Name: accounts_lifecycle_backup_20260718; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.accounts_lifecycle_backup_20260718 ENABLE ROW LEVEL SECURITY;

--
-- Name: activities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

--
-- Name: activities activities_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY activities_delete ON public.activities FOR DELETE TO authenticated USING ((((company_id = public.get_user_company_id()) AND (public.is_manager_or_above() OR (created_by = auth.uid()))) OR public.is_super_admin()));


--
-- Name: activities activities_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY activities_insert ON public.activities FOR INSERT TO authenticated WITH CHECK (((company_id = public.get_user_company_id()) OR public.is_super_admin()));


--
-- Name: activities activities_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY activities_select ON public.activities FOR SELECT TO authenticated USING ((((company_id = public.get_user_company_id()) AND (public.is_manager_or_above() OR (assigned_to = auth.uid()) OR (created_by = auth.uid()))) OR public.is_super_admin()));


--
-- Name: activities activities_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY activities_update ON public.activities FOR UPDATE TO authenticated USING ((((company_id = public.get_user_company_id()) AND (public.is_manager_or_above() OR (assigned_to = auth.uid()) OR (created_by = auth.uid()))) OR public.is_super_admin())) WITH CHECK ((((company_id = public.get_user_company_id()) AND (public.is_manager_or_above() OR (assigned_to = auth.uid()) OR (created_by = auth.uid()))) OR public.is_super_admin()));


--
-- Name: activity_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: activity_logs activity_logs_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY activity_logs_delete ON public.activity_logs FOR DELETE TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.activities a
  WHERE (a.id = activity_logs.activity_id))) OR public.is_super_admin()));


--
-- Name: activity_logs activity_logs_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY activity_logs_insert ON public.activity_logs FOR INSERT TO authenticated WITH CHECK (((EXISTS ( SELECT 1
   FROM public.activities a
  WHERE (a.id = activity_logs.activity_id))) OR public.is_super_admin()));


--
-- Name: activity_logs activity_logs_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY activity_logs_select ON public.activity_logs FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.activities a
  WHERE (a.id = activity_logs.activity_id))) OR public.is_super_admin()));


--
-- Name: activity_logs activity_logs_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY activity_logs_update ON public.activity_logs FOR UPDATE TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.activities a
  WHERE (a.id = activity_logs.activity_id))) OR public.is_super_admin())) WITH CHECK (((EXISTS ( SELECT 1
   FROM public.activities a
  WHERE (a.id = activity_logs.activity_id))) OR public.is_super_admin()));


--
-- Name: app_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: app_settings app_settings_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY app_settings_read ON public.app_settings FOR SELECT USING (public.is_admin_or_above());


--
-- Name: app_settings app_settings_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY app_settings_update ON public.app_settings FOR UPDATE USING (public.is_admin_or_above());


--
-- Name: app_settings app_settings_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY app_settings_write ON public.app_settings FOR INSERT WITH CHECK (public.is_admin_or_above());


--
-- Name: approval_delegations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.approval_delegations ENABLE ROW LEVEL SECURITY;

--
-- Name: approval_delegations approval_delegations_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY approval_delegations_insert ON public.approval_delegations FOR INSERT TO authenticated WITH CHECK (((company_id = public.get_user_company_id()) AND ((delegator_id = auth.uid()) OR public.is_admin_or_above())));


--
-- Name: approval_delegations approval_delegations_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY approval_delegations_read ON public.approval_delegations FOR SELECT TO authenticated USING (((delegator_id = auth.uid()) OR (delegate_id = auth.uid()) OR ((company_id = public.get_user_company_id()) AND (public.is_admin_or_above() OR public.is_manager_or_above())) OR public.is_super_admin()));


--
-- Name: approval_delegations approval_delegations_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY approval_delegations_update ON public.approval_delegations FOR UPDATE TO authenticated USING ((company_id = public.get_user_company_id())) WITH CHECK (((company_id = public.get_user_company_id()) AND public.is_admin_or_above()));


--
-- Name: approval_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.approval_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: approval_logs approval_logs_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY approval_logs_insert ON public.approval_logs FOR INSERT TO authenticated WITH CHECK (((company_id = public.get_user_company_id()) AND (actor_id = auth.uid())));


--
-- Name: approval_logs approval_logs_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY approval_logs_read ON public.approval_logs FOR SELECT TO authenticated USING ((company_id = public.get_user_company_id()));


--
-- Name: approval_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.approval_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: approval_rules approval_rules_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY approval_rules_insert ON public.approval_rules FOR INSERT TO authenticated WITH CHECK (((company_id = public.get_user_company_id()) AND public.is_admin_or_above()));


--
-- Name: approval_rules approval_rules_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY approval_rules_read ON public.approval_rules FOR SELECT TO authenticated USING ((company_id = public.get_user_company_id()));


--
-- Name: approval_rules approval_rules_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY approval_rules_update ON public.approval_rules FOR UPDATE TO authenticated USING ((company_id = public.get_user_company_id())) WITH CHECK (((company_id = public.get_user_company_id()) AND public.is_admin_or_above()));


--
-- Name: approval_workflow_steps; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.approval_workflow_steps ENABLE ROW LEVEL SECURITY;

--
-- Name: approval_workflow_steps approval_workflow_steps_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY approval_workflow_steps_access ON public.approval_workflow_steps TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.approval_workflows aw
  WHERE ((aw.id = approval_workflow_steps.workflow_id) AND (((aw.company_id = public.get_user_company_id()) AND public.is_admin_or_above()) OR public.is_super_admin()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.approval_workflows aw
  WHERE ((aw.id = approval_workflow_steps.workflow_id) AND (((aw.company_id = public.get_user_company_id()) AND public.is_admin_or_above()) OR public.is_super_admin())))));


--
-- Name: approval_workflows; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.approval_workflows ENABLE ROW LEVEL SECURITY;

--
-- Name: approval_workflows approval_workflows_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY approval_workflows_access ON public.approval_workflows TO authenticated USING ((((company_id = public.get_user_company_id()) AND public.is_admin_or_above()) OR public.is_super_admin())) WITH CHECK ((((company_id = public.get_user_company_id()) AND public.is_admin_or_above()) OR public.is_super_admin()));


--
-- Name: ar_btbs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ar_btbs ENABLE ROW LEVEL SECURITY;

--
-- Name: ar_btbs ar_btbs_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ar_btbs_delete ON public.ar_btbs FOR DELETE TO authenticated USING (true);


--
-- Name: ar_btbs ar_btbs_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ar_btbs_insert ON public.ar_btbs FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: ar_btbs ar_btbs_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ar_btbs_read ON public.ar_btbs FOR SELECT TO authenticated USING (true);


--
-- Name: ar_ttfs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ar_ttfs ENABLE ROW LEVEL SECURITY;

--
-- Name: ar_ttfs ar_ttfs_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ar_ttfs_delete ON public.ar_ttfs FOR DELETE TO authenticated USING (true);


--
-- Name: ar_ttfs ar_ttfs_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ar_ttfs_insert ON public.ar_ttfs FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: ar_ttfs ar_ttfs_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ar_ttfs_read ON public.ar_ttfs FOR SELECT TO authenticated USING (true);


--
-- Name: ar_ttfs ar_ttfs_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ar_ttfs_update ON public.ar_ttfs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: asset_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.asset_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: asset_categories asset_categories_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY asset_categories_insert ON public.asset_categories FOR INSERT TO authenticated WITH CHECK (((company_id = public.get_user_company_id()) AND public.is_admin_or_above()));


--
-- Name: asset_categories asset_categories_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY asset_categories_read ON public.asset_categories FOR SELECT TO authenticated USING (((company_id = public.get_user_company_id()) OR public.is_super_admin()));


--
-- Name: asset_categories asset_categories_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY asset_categories_update ON public.asset_categories FOR UPDATE TO authenticated USING (((company_id = public.get_user_company_id()) AND public.is_admin_or_above())) WITH CHECK (((company_id = public.get_user_company_id()) AND public.is_admin_or_above()));


--
-- Name: asset_fuel_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.asset_fuel_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: asset_locations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.asset_locations ENABLE ROW LEVEL SECURITY;

--
-- Name: asset_locations asset_locations_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY asset_locations_insert ON public.asset_locations FOR INSERT TO authenticated WITH CHECK (((company_id = public.get_user_company_id()) AND public.is_admin_or_above()));


--
-- Name: asset_locations asset_locations_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY asset_locations_read ON public.asset_locations FOR SELECT TO authenticated USING (((company_id = public.get_user_company_id()) OR public.is_super_admin()));


--
-- Name: asset_locations asset_locations_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY asset_locations_update ON public.asset_locations FOR UPDATE TO authenticated USING (((company_id = public.get_user_company_id()) AND public.is_admin_or_above())) WITH CHECK (((company_id = public.get_user_company_id()) AND public.is_admin_or_above()));


--
-- Name: asset_maintenance_records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.asset_maintenance_records ENABLE ROW LEVEL SECURITY;

--
-- Name: asset_network; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.asset_network ENABLE ROW LEVEL SECURITY;

--
-- Name: asset_software_licenses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.asset_software_licenses ENABLE ROW LEVEL SECURITY;

--
-- Name: asset_specifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.asset_specifications ENABLE ROW LEVEL SECURITY;

--
-- Name: assets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

--
-- Name: assets assets_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY assets_insert ON public.assets FOR INSERT TO authenticated WITH CHECK (((company_id = public.get_user_company_id()) AND public.is_admin_or_above()));


--
-- Name: assets assets_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY assets_read ON public.assets FOR SELECT TO authenticated USING (((company_id = public.get_user_company_id()) OR public.is_super_admin()));


--
-- Name: assets assets_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY assets_update ON public.assets FOR UPDATE TO authenticated USING (((company_id = public.get_user_company_id()) AND public.is_admin_or_above())) WITH CHECK (((company_id = public.get_user_company_id()) AND public.is_admin_or_above()));


--
-- Name: audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_logs audit_logs_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_logs_insert ON public.audit_logs FOR INSERT WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: audit_logs audit_logs_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_logs_read ON public.audit_logs FOR SELECT USING (public.is_admin_or_above());


--
-- Name: branches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

--
-- Name: branches branches_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY branches_insert ON public.branches FOR INSERT WITH CHECK ((public.is_super_admin() OR (public.is_admin_or_above() AND (company_id = public.get_user_company_id()))));


--
-- Name: branches branches_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY branches_read ON public.branches FOR SELECT TO authenticated USING ((public.is_super_admin() OR ((company_id = public.get_user_company_id()) AND (deleted_at IS NULL))));


--
-- Name: branches branches_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY branches_update ON public.branches FOR UPDATE USING ((public.is_super_admin() OR (public.is_admin_or_above() AND (company_id = public.get_user_company_id())))) WITH CHECK ((public.is_super_admin() OR (public.is_admin_or_above() AND (company_id = public.get_user_company_id()))));


--
-- Name: chart_of_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chart_of_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: chart_of_accounts chart_of_accounts_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chart_of_accounts_insert ON public.chart_of_accounts FOR INSERT TO authenticated WITH CHECK (((company_id = public.get_user_company_id()) AND (public.has_role('finance_controller'::text) OR public.is_super_admin())));


--
-- Name: chart_of_accounts chart_of_accounts_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chart_of_accounts_read ON public.chart_of_accounts FOR SELECT TO authenticated USING (((company_id = public.get_user_company_id()) OR public.is_super_admin()));


--
-- Name: chart_of_accounts chart_of_accounts_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chart_of_accounts_update ON public.chart_of_accounts FOR UPDATE TO authenticated USING (((company_id = public.get_user_company_id()) AND (public.has_role('finance_controller'::text) OR public.is_super_admin()))) WITH CHECK (((company_id = public.get_user_company_id()) AND (public.has_role('finance_controller'::text) OR public.is_super_admin())));


--
-- Name: companies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

--
-- Name: companies companies_read_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY companies_read_own ON public.companies FOR SELECT TO authenticated USING (((id = public.get_user_company_id()) OR public.is_super_admin()));


--
-- Name: companies companies_super_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY companies_super_admin_write ON public.companies TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--
-- Name: cost_centers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cost_centers ENABLE ROW LEVEL SECURITY;

--
-- Name: cost_centers cost_centers_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cost_centers_insert ON public.cost_centers FOR INSERT TO authenticated WITH CHECK (((company_id = public.get_user_company_id()) AND public.is_admin_or_above()));


--
-- Name: cost_centers cost_centers_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cost_centers_read ON public.cost_centers FOR SELECT TO authenticated USING (((company_id = public.get_user_company_id()) OR public.is_super_admin()));


--
-- Name: cost_centers cost_centers_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cost_centers_update ON public.cost_centers FOR UPDATE TO authenticated USING (((company_id = public.get_user_company_id()) AND public.is_admin_or_above())) WITH CHECK (((company_id = public.get_user_company_id()) AND public.is_admin_or_above()));


--
-- Name: currencies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.currencies ENABLE ROW LEVEL SECURITY;

--
-- Name: currencies currencies_read_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY currencies_read_all ON public.currencies FOR SELECT TO authenticated USING (true);


--
-- Name: currencies currencies_super_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY currencies_super_admin_write ON public.currencies TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--
-- Name: customers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

--
-- Name: customers customers_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customers_insert ON public.customers FOR INSERT WITH CHECK ((company_id = public.get_user_company_id()));


--
-- Name: customers customers_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customers_read ON public.customers FOR SELECT USING (((company_id = public.get_user_company_id()) AND ((deleted_at IS NULL) OR public.is_super_admin())));


--
-- Name: customers customers_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customers_update ON public.customers FOR UPDATE USING ((company_id = public.get_user_company_id()));


--
-- Name: dc_master; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dc_master ENABLE ROW LEVEL SECURITY;

--
-- Name: dc_master dc_master_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dc_master_delete ON public.dc_master FOR DELETE USING (public.is_super_admin());


--
-- Name: dc_master dc_master_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dc_master_insert ON public.dc_master FOR INSERT WITH CHECK ((public.is_super_admin() OR ((company_id = public.get_user_company_id()) AND (public.is_manager_or_above() OR public.has_role('operations'::text)))));


--
-- Name: dc_master dc_master_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dc_master_read ON public.dc_master FOR SELECT USING ((public.is_super_admin() OR (company_id = public.get_user_company_id())));


--
-- Name: dc_master dc_master_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dc_master_update ON public.dc_master FOR UPDATE USING ((public.is_super_admin() OR ((company_id = public.get_user_company_id()) AND (public.is_manager_or_above() OR public.has_role('operations'::text)))));


--
-- Name: deal_handovers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.deal_handovers ENABLE ROW LEVEL SECURITY;

--
-- Name: delivery_note_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.delivery_note_items ENABLE ROW LEVEL SECURITY;

--
-- Name: delivery_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.delivery_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: departments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

--
-- Name: departments departments_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY departments_insert ON public.departments FOR INSERT WITH CHECK ((public.is_super_admin() OR (public.is_admin_or_above() AND (company_id = public.get_user_company_id()))));


--
-- Name: departments departments_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY departments_read ON public.departments FOR SELECT TO authenticated USING ((public.is_super_admin() OR ((company_id = public.get_user_company_id()) AND (deleted_at IS NULL))));


--
-- Name: departments departments_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY departments_update ON public.departments FOR UPDATE USING ((public.is_super_admin() OR (public.is_admin_or_above() AND (company_id = public.get_user_company_id())))) WITH CHECK ((public.is_super_admin() OR (public.is_admin_or_above() AND (company_id = public.get_user_company_id()))));


--
-- Name: delivery_notes dn_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dn_delete ON public.delivery_notes FOR DELETE TO authenticated USING (true);


--
-- Name: delivery_notes dn_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dn_insert ON public.delivery_notes FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: delivery_notes dn_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dn_read ON public.delivery_notes FOR SELECT TO authenticated USING (true);


--
-- Name: delivery_notes dn_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dn_update ON public.delivery_notes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: delivery_note_items dni_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dni_delete ON public.delivery_note_items FOR DELETE TO authenticated USING (true);


--
-- Name: delivery_note_items dni_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dni_insert ON public.delivery_note_items FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: delivery_note_items dni_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dni_read ON public.delivery_note_items FOR SELECT TO authenticated USING (true);


--
-- Name: delivery_note_items dni_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dni_update ON public.delivery_note_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: document_numbering; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.document_numbering ENABLE ROW LEVEL SECURITY;

--
-- Name: document_numbering document_numbering_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY document_numbering_access ON public.document_numbering TO authenticated USING ((((company_id = public.get_user_company_id()) AND public.is_admin_or_above()) OR public.is_super_admin())) WITH CHECK ((((company_id = public.get_user_company_id()) AND public.is_admin_or_above()) OR public.is_super_admin()));


--
-- Name: document_sequences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.document_sequences ENABLE ROW LEVEL SECURITY;

--
-- Name: document_sequences document_sequences_increment; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY document_sequences_increment ON public.document_sequences FOR UPDATE TO authenticated USING ((company_id = public.get_user_company_id())) WITH CHECK ((company_id = public.get_user_company_id()));


--
-- Name: document_sequences document_sequences_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY document_sequences_insert ON public.document_sequences FOR INSERT TO authenticated WITH CHECK ((company_id = public.get_user_company_id()));


--
-- Name: POLICY document_sequences_insert ON document_sequences; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON POLICY document_sequences_insert ON public.document_sequences IS 'Any authenticated company user may insert a new sequence row. Atomic increment is handled by increment_document_sequence() RPC (SECURITY DEFINER). Policy relaxed from admin-only in migration 023 to support first-document-of-year by non-admin staff across all document types.';


--
-- Name: document_sequences document_sequences_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY document_sequences_read ON public.document_sequences FOR SELECT TO authenticated USING ((company_id = public.get_user_company_id()));


--
-- Name: document_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: document_templates document_templates_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY document_templates_access ON public.document_templates TO authenticated USING ((((company_id = public.get_user_company_id()) AND public.is_admin_or_above()) OR public.is_super_admin())) WITH CHECK ((((company_id = public.get_user_company_id()) AND public.is_admin_or_above()) OR public.is_super_admin()));


--
-- Name: document_types; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.document_types ENABLE ROW LEVEL SECURITY;

--
-- Name: document_types document_types_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY document_types_insert ON public.document_types FOR INSERT TO authenticated WITH CHECK (((company_id = public.get_user_company_id()) AND public.is_admin_or_above()));


--
-- Name: document_types document_types_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY document_types_read ON public.document_types FOR SELECT TO authenticated USING ((company_id = public.get_user_company_id()));


--
-- Name: document_types document_types_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY document_types_update ON public.document_types FOR UPDATE TO authenticated USING ((company_id = public.get_user_company_id())) WITH CHECK (((company_id = public.get_user_company_id()) AND public.is_admin_or_above()));


--
-- Name: dropdown_options; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dropdown_options ENABLE ROW LEVEL SECURITY;

--
-- Name: dropdown_options dropdown_options_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dropdown_options_delete ON public.dropdown_options FOR DELETE TO authenticated USING (public.is_super_admin());


--
-- Name: dropdown_options dropdown_options_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dropdown_options_insert ON public.dropdown_options FOR INSERT TO authenticated WITH CHECK (public.is_super_admin());


--
-- Name: dropdown_options dropdown_options_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dropdown_options_read ON public.dropdown_options FOR SELECT TO authenticated USING (((deleted_at IS NULL) AND ((company_id IS NULL) OR (company_id = public.get_user_company_id()) OR public.is_super_admin())));


--
-- Name: dropdown_options dropdown_options_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dropdown_options_update ON public.dropdown_options FOR UPDATE TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--
-- Name: entity_bank_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.entity_bank_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: entity_bank_accounts entity_bank_accounts_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY entity_bank_accounts_access ON public.entity_bank_accounts TO authenticated USING ((((company_id = public.get_user_company_id()) AND public.is_admin_or_above()) OR public.is_super_admin())) WITH CHECK ((((company_id = public.get_user_company_id()) AND public.is_admin_or_above()) OR public.is_super_admin()));


--
-- Name: entity_finance_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.entity_finance_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: entity_finance_settings entity_finance_settings_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY entity_finance_settings_access ON public.entity_finance_settings TO authenticated USING ((((company_id = public.get_user_company_id()) AND public.is_admin_or_above()) OR public.is_super_admin())) WITH CHECK ((((company_id = public.get_user_company_id()) AND public.is_admin_or_above()) OR public.is_super_admin()));


--
-- Name: entity_signatories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.entity_signatories ENABLE ROW LEVEL SECURITY;

--
-- Name: entity_signatories entity_signatories_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY entity_signatories_access ON public.entity_signatories TO authenticated USING ((((company_id = public.get_user_company_id()) AND public.is_admin_or_above()) OR public.is_super_admin())) WITH CHECK ((((company_id = public.get_user_company_id()) AND public.is_admin_or_above()) OR public.is_super_admin()));


--
-- Name: exchange_rates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;

--
-- Name: exchange_rates exchange_rates_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY exchange_rates_insert ON public.exchange_rates FOR INSERT TO authenticated WITH CHECK (((company_id = public.get_user_company_id()) AND (public.is_admin_or_above() OR public.has_role('finance_controller'::text))));


--
-- Name: exchange_rates exchange_rates_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY exchange_rates_read ON public.exchange_rates FOR SELECT TO authenticated USING ((company_id = public.get_user_company_id()));


--
-- Name: asset_fuel_logs fuel_logs_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fuel_logs_insert ON public.asset_fuel_logs FOR INSERT WITH CHECK ((company_id = public.get_user_company_id()));


--
-- Name: asset_fuel_logs fuel_logs_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fuel_logs_select ON public.asset_fuel_logs FOR SELECT USING ((public.is_super_admin() OR (company_id = public.get_user_company_id())));


--
-- Name: asset_fuel_logs fuel_logs_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fuel_logs_update ON public.asset_fuel_logs FOR UPDATE USING ((company_id = public.get_user_company_id()));


--
-- Name: deal_handovers handover_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY handover_read ON public.deal_handovers FOR SELECT USING ((company_id = public.get_user_company_id()));


--
-- Name: deal_handovers handover_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY handover_update ON public.deal_handovers FOR UPDATE USING (((company_id = public.get_user_company_id()) AND (public.is_manager_or_above() OR (created_by = auth.uid()))));


--
-- Name: deal_handovers handover_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY handover_write ON public.deal_handovers FOR INSERT WITH CHECK ((company_id = public.get_user_company_id()));


--
-- Name: hrga_approval_configs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hrga_approval_configs ENABLE ROW LEVEL SECURITY;

--
-- Name: hrga_approval_configs hrga_approval_configs_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hrga_approval_configs_insert ON public.hrga_approval_configs FOR INSERT TO authenticated WITH CHECK ((public.is_super_admin() OR ((company_id = public.get_user_company_id()) AND (public.is_admin_or_above() OR public.has_role('hrga'::text)))));


--
-- Name: hrga_approval_configs hrga_approval_configs_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hrga_approval_configs_read ON public.hrga_approval_configs FOR SELECT TO authenticated USING ((public.is_super_admin() OR (company_id = public.get_user_company_id())));


--
-- Name: hrga_approval_configs hrga_approval_configs_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hrga_approval_configs_update ON public.hrga_approval_configs FOR UPDATE TO authenticated USING ((public.is_super_admin() OR ((company_id = public.get_user_company_id()) AND (public.is_admin_or_above() OR public.has_role('hrga'::text))))) WITH CHECK ((public.is_super_admin() OR ((company_id = public.get_user_company_id()) AND (public.is_admin_or_above() OR public.has_role('hrga'::text)))));


--
-- Name: hrga_notification_queue; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hrga_notification_queue ENABLE ROW LEVEL SECURITY;

--
-- Name: hrga_notification_queue hrga_notification_queue_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hrga_notification_queue_insert ON public.hrga_notification_queue FOR INSERT TO authenticated WITH CHECK ((company_id = public.get_user_company_id()));


--
-- Name: hrga_notification_queue hrga_notification_queue_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hrga_notification_queue_read ON public.hrga_notification_queue FOR SELECT TO authenticated USING ((((company_id = public.get_user_company_id()) AND (public.is_admin_or_above() OR public.is_manager_or_above())) OR public.is_super_admin()));


--
-- Name: hrga_notification_queue hrga_notification_queue_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hrga_notification_queue_update ON public.hrga_notification_queue FOR UPDATE TO authenticated USING ((public.is_super_admin() OR ((company_id = public.get_user_company_id()) AND public.is_admin_or_above()))) WITH CHECK ((company_id = public.get_user_company_id()));


--
-- Name: hrga_offboarding_checklists; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hrga_offboarding_checklists ENABLE ROW LEVEL SECURITY;

--
-- Name: hrga_offboarding_checklists hrga_offboarding_checklists_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hrga_offboarding_checklists_insert ON public.hrga_offboarding_checklists FOR INSERT TO authenticated WITH CHECK ((public.is_super_admin() OR ((company_id = public.get_user_company_id()) AND (public.is_admin_or_above() OR public.has_role('hrga'::text)))));


--
-- Name: hrga_offboarding_checklists hrga_offboarding_checklists_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hrga_offboarding_checklists_read ON public.hrga_offboarding_checklists FOR SELECT TO authenticated USING (((deleted_at IS NULL) AND (public.is_super_admin() OR (company_id = public.get_user_company_id()))));


--
-- Name: hrga_offboarding_checklists hrga_offboarding_checklists_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hrga_offboarding_checklists_update ON public.hrga_offboarding_checklists FOR UPDATE TO authenticated USING (((deleted_at IS NULL) AND (public.is_super_admin() OR ((company_id = public.get_user_company_id()) AND (public.is_admin_or_above() OR public.has_role('hrga'::text)))))) WITH CHECK ((public.is_super_admin() OR ((company_id = public.get_user_company_id()) AND (public.is_admin_or_above() OR public.has_role('hrga'::text)))));


--
-- Name: hrga_offboarding_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hrga_offboarding_items ENABLE ROW LEVEL SECURITY;

--
-- Name: hrga_offboarding_items hrga_offboarding_items_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hrga_offboarding_items_delete ON public.hrga_offboarding_items FOR DELETE TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.hrga_requests r
  WHERE ((r.id = hrga_offboarding_items.request_id) AND (r.company_id = public.get_user_company_id()) AND public.is_manager_or_above()))) OR public.is_super_admin()));


--
-- Name: hrga_offboarding_items hrga_offboarding_items_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hrga_offboarding_items_insert ON public.hrga_offboarding_items FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.hrga_requests r
  WHERE ((r.id = hrga_offboarding_items.request_id) AND (r.company_id = public.get_user_company_id()) AND (r.deleted_at IS NULL)))));


--
-- Name: hrga_offboarding_items hrga_offboarding_items_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hrga_offboarding_items_read ON public.hrga_offboarding_items FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.hrga_requests r
  WHERE ((r.id = hrga_offboarding_items.request_id) AND (r.deleted_at IS NULL) AND (public.is_super_admin() OR (r.company_id = public.get_user_company_id()))))));


--
-- Name: hrga_offboarding_items hrga_offboarding_items_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hrga_offboarding_items_update ON public.hrga_offboarding_items FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.hrga_requests r
  WHERE ((r.id = hrga_offboarding_items.request_id) AND (r.deleted_at IS NULL) AND (r.company_id = public.get_user_company_id()) AND (public.is_super_admin() OR public.is_admin_or_above() OR public.has_role('hrga'::text) OR public.has_role('it'::text) OR public.has_role('finance'::text)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.hrga_requests r
  WHERE ((r.id = hrga_offboarding_items.request_id) AND (r.company_id = public.get_user_company_id())))));


--
-- Name: hrga_request_approvals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hrga_request_approvals ENABLE ROW LEVEL SECURITY;

--
-- Name: hrga_request_approvals hrga_request_approvals_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hrga_request_approvals_insert ON public.hrga_request_approvals FOR INSERT TO authenticated WITH CHECK (((approver_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.hrga_requests r
  WHERE ((r.id = hrga_request_approvals.request_id) AND (r.company_id = public.get_user_company_id()) AND (r.deleted_at IS NULL))))));


--
-- Name: hrga_request_approvals hrga_request_approvals_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hrga_request_approvals_read ON public.hrga_request_approvals FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.hrga_requests r
  WHERE ((r.id = hrga_request_approvals.request_id) AND (r.deleted_at IS NULL) AND (public.is_super_admin() OR (r.company_id = public.get_user_company_id()))))));


--
-- Name: hrga_request_attachments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hrga_request_attachments ENABLE ROW LEVEL SECURITY;

--
-- Name: hrga_request_attachments hrga_request_attachments_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hrga_request_attachments_insert ON public.hrga_request_attachments FOR INSERT TO authenticated WITH CHECK (((uploaded_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.hrga_requests r
  WHERE ((r.id = hrga_request_attachments.request_id) AND (r.deleted_at IS NULL) AND (r.company_id = public.get_user_company_id()))))));


--
-- Name: hrga_request_attachments hrga_request_attachments_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hrga_request_attachments_read ON public.hrga_request_attachments FOR SELECT TO authenticated USING (((deleted_at IS NULL) AND (EXISTS ( SELECT 1
   FROM public.hrga_requests r
  WHERE ((r.id = hrga_request_attachments.request_id) AND (r.deleted_at IS NULL) AND (public.is_super_admin() OR (r.company_id = public.get_user_company_id())))))));


--
-- Name: hrga_request_attachments hrga_request_attachments_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hrga_request_attachments_update ON public.hrga_request_attachments FOR UPDATE TO authenticated USING (((deleted_at IS NULL) AND (EXISTS ( SELECT 1
   FROM public.hrga_requests r
  WHERE ((r.id = hrga_request_attachments.request_id) AND (r.company_id = public.get_user_company_id())))) AND (public.is_super_admin() OR public.is_admin_or_above() OR public.has_role('hrga'::text) OR (uploaded_by = auth.uid())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.hrga_requests r
  WHERE ((r.id = hrga_request_attachments.request_id) AND (r.company_id = public.get_user_company_id())))));


--
-- Name: hrga_request_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hrga_request_items ENABLE ROW LEVEL SECURITY;

--
-- Name: hrga_request_items hrga_request_items_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hrga_request_items_delete ON public.hrga_request_items FOR DELETE TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.hrga_requests r
  WHERE ((r.id = hrga_request_items.request_id) AND ((r.requester_id = auth.uid()) OR public.is_manager_or_above()) AND (r.company_id = public.get_user_company_id())))) OR public.is_super_admin()));


--
-- Name: hrga_request_items hrga_request_items_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hrga_request_items_insert ON public.hrga_request_items FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.hrga_requests r
  WHERE ((r.id = hrga_request_items.request_id) AND (r.requester_id = auth.uid()) AND ((r.status)::text = ANY ((ARRAY['draft'::character varying, 'submitted'::character varying])::text[])) AND (r.company_id = public.get_user_company_id())))));


--
-- Name: POLICY hrga_request_items_insert ON hrga_request_items; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON POLICY hrga_request_items_insert ON public.hrga_request_items IS 'Requester can insert line items while parent request is draft or submitted. Items are created atomically with the header in submitHrgaRequest(). Status guard prevents adding items to requests already under_review or approved.';


--
-- Name: hrga_request_items hrga_request_items_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hrga_request_items_read ON public.hrga_request_items FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.hrga_requests r
  WHERE ((r.id = hrga_request_items.request_id) AND (r.deleted_at IS NULL) AND (public.is_super_admin() OR (r.company_id = public.get_user_company_id()))))));


--
-- Name: hrga_request_items hrga_request_items_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hrga_request_items_update ON public.hrga_request_items FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.hrga_requests r
  WHERE ((r.id = hrga_request_items.request_id) AND (r.requester_id = auth.uid()) AND ((r.status)::text = ANY ((ARRAY['draft'::character varying, 'revision_requested'::character varying])::text[])) AND (r.company_id = public.get_user_company_id()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.hrga_requests r
  WHERE ((r.id = hrga_request_items.request_id) AND (r.requester_id = auth.uid()) AND (r.company_id = public.get_user_company_id())))));


--
-- Name: hrga_request_types; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hrga_request_types ENABLE ROW LEVEL SECURITY;

--
-- Name: hrga_request_types hrga_request_types_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hrga_request_types_insert ON public.hrga_request_types FOR INSERT TO authenticated WITH CHECK ((public.is_super_admin() OR ((company_id = public.get_user_company_id()) AND (public.is_admin_or_above() OR public.has_role('hrga'::text)))));


--
-- Name: hrga_request_types hrga_request_types_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hrga_request_types_read ON public.hrga_request_types FOR SELECT TO authenticated USING ((public.is_super_admin() OR ((company_id = public.get_user_company_id()) AND (deleted_at IS NULL))));


--
-- Name: hrga_request_types hrga_request_types_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hrga_request_types_update ON public.hrga_request_types FOR UPDATE TO authenticated USING ((public.is_super_admin() OR ((company_id = public.get_user_company_id()) AND (public.is_admin_or_above() OR public.has_role('hrga'::text))))) WITH CHECK ((public.is_super_admin() OR ((company_id = public.get_user_company_id()) AND (public.is_admin_or_above() OR public.has_role('hrga'::text)))));


--
-- Name: hrga_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hrga_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: hrga_requests hrga_requests_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hrga_requests_insert ON public.hrga_requests FOR INSERT TO authenticated WITH CHECK (((company_id = public.get_user_company_id()) AND (requester_id = auth.uid())));


--
-- Name: hrga_requests hrga_requests_read_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hrga_requests_read_own ON public.hrga_requests FOR SELECT TO authenticated USING (((requester_id = auth.uid()) OR ((company_id = public.get_user_company_id()) AND (public.is_admin_or_above() OR public.is_manager_or_above() OR public.has_role('hrga'::text) OR public.has_role('it'::text) OR public.has_role('finance'::text))) OR public.is_super_admin()));


--
-- Name: hrga_requests hrga_requests_update_draft; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hrga_requests_update_draft ON public.hrga_requests FOR UPDATE TO authenticated USING (((deleted_at IS NULL) AND (company_id = public.get_user_company_id()) AND (requester_id = auth.uid()) AND ((status)::text = ANY ((ARRAY['draft'::character varying, 'revision_requested'::character varying])::text[])))) WITH CHECK (((company_id = public.get_user_company_id()) AND (requester_id = auth.uid())));


--
-- Name: hrga_requests hrga_requests_update_status; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hrga_requests_update_status ON public.hrga_requests FOR UPDATE TO authenticated USING (((deleted_at IS NULL) AND (company_id = public.get_user_company_id()) AND (public.is_super_admin() OR public.is_admin_or_above() OR public.has_role('hrga'::text) OR public.has_role('it'::text) OR public.has_role('finance'::text) OR ((requester_id = auth.uid()) AND ((status)::text = 'submitted'::text))))) WITH CHECK ((company_id = public.get_user_company_id()));


--
-- Name: inquiries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inquiries ENABLE ROW LEVEL SECURITY;

--
-- Name: inquiries inquiries_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY inquiries_insert ON public.inquiries FOR INSERT WITH CHECK ((company_id = public.get_user_company_id()));


--
-- Name: inquiries inquiries_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY inquiries_read ON public.inquiries FOR SELECT USING ((((company_id = public.get_user_company_id()) AND (public.is_manager_or_above() OR (created_by = auth.uid()))) OR public.is_super_admin()));


--
-- Name: inquiries_status_backup_20260722; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inquiries_status_backup_20260722 ENABLE ROW LEVEL SECURITY;

--
-- Name: inquiries inquiries_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY inquiries_update ON public.inquiries FOR UPDATE TO authenticated USING ((((company_id = public.get_user_company_id()) AND (public.is_manager_or_above() OR (created_by = auth.uid()))) OR public.is_super_admin())) WITH CHECK ((((company_id = public.get_user_company_id()) AND (public.is_manager_or_above() OR (created_by = auth.uid()))) OR public.is_super_admin()));


--
-- Name: asset_maintenance_records maintenance_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY maintenance_insert ON public.asset_maintenance_records FOR INSERT WITH CHECK ((company_id = public.get_user_company_id()));


--
-- Name: asset_maintenance_records maintenance_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY maintenance_select ON public.asset_maintenance_records FOR SELECT USING ((public.is_super_admin() OR (company_id = public.get_user_company_id())));


--
-- Name: asset_maintenance_records maintenance_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY maintenance_update ON public.asset_maintenance_records FOR UPDATE USING ((company_id = public.get_user_company_id()));


--
-- Name: meeting_moms; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.meeting_moms ENABLE ROW LEVEL SECURITY;

--
-- Name: menu_actions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.menu_actions ENABLE ROW LEVEL SECURITY;

--
-- Name: menu_actions menu_actions_admin_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY menu_actions_admin_only ON public.menu_actions TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--
-- Name: menu_actions menu_actions_read_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY menu_actions_read_all ON public.menu_actions FOR SELECT USING (true);


--
-- Name: module_actions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.module_actions ENABLE ROW LEVEL SECURITY;

--
-- Name: module_actions module_actions_admin_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY module_actions_admin_only ON public.module_actions TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--
-- Name: module_actions module_actions_read_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY module_actions_read_all ON public.module_actions FOR SELECT USING (true);


--
-- Name: module_menus; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.module_menus ENABLE ROW LEVEL SECURITY;

--
-- Name: module_menus module_menus_admin_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY module_menus_admin_only ON public.module_menus TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--
-- Name: module_menus module_menus_read_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY module_menus_read_all ON public.module_menus FOR SELECT USING (true);


--
-- Name: modules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.modules ENABLE ROW LEVEL SECURITY;

--
-- Name: modules modules_admin_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY modules_admin_only ON public.modules TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--
-- Name: modules modules_read_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY modules_read_all ON public.modules FOR SELECT USING (true);


--
-- Name: mom_action_plans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mom_action_plans ENABLE ROW LEVEL SECURITY;

--
-- Name: mom_action_plans mom_children_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mom_children_delete ON public.mom_action_plans FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.meeting_moms m
  WHERE ((m.id = mom_action_plans.mom_id) AND (m.company_id = public.get_user_company_id())))));


--
-- Name: mom_action_plans mom_children_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mom_children_insert ON public.mom_action_plans FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.meeting_moms m
  WHERE ((m.id = mom_action_plans.mom_id) AND (m.company_id = public.get_user_company_id())))));


--
-- Name: mom_action_plans mom_children_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mom_children_read ON public.mom_action_plans FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.meeting_moms m
  WHERE ((m.id = mom_action_plans.mom_id) AND (m.company_id = public.get_user_company_id())))));


--
-- Name: mom_action_plans mom_children_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mom_children_update ON public.mom_action_plans FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.meeting_moms m
  WHERE ((m.id = mom_action_plans.mom_id) AND (m.company_id = public.get_user_company_id())))));


--
-- Name: mom_improvements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mom_improvements ENABLE ROW LEVEL SECURITY;

--
-- Name: mom_improvements mom_improvements_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mom_improvements_delete ON public.mom_improvements FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.meeting_moms m
  WHERE ((m.id = mom_improvements.mom_id) AND (m.company_id = public.get_user_company_id())))));


--
-- Name: mom_improvements mom_improvements_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mom_improvements_insert ON public.mom_improvements FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.meeting_moms m
  WHERE ((m.id = mom_improvements.mom_id) AND (m.company_id = public.get_user_company_id())))));


--
-- Name: mom_improvements mom_improvements_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mom_improvements_read ON public.mom_improvements FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.meeting_moms m
  WHERE ((m.id = mom_improvements.mom_id) AND (m.company_id = public.get_user_company_id())))));


--
-- Name: mom_improvements mom_improvements_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mom_improvements_update ON public.mom_improvements FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.meeting_moms m
  WHERE ((m.id = mom_improvements.mom_id) AND (m.company_id = public.get_user_company_id())))));


--
-- Name: mom_issues; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mom_issues ENABLE ROW LEVEL SECURITY;

--
-- Name: mom_issues mom_issues_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mom_issues_delete ON public.mom_issues FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.meeting_moms m
  WHERE ((m.id = mom_issues.mom_id) AND (m.company_id = public.get_user_company_id())))));


--
-- Name: mom_issues mom_issues_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mom_issues_insert ON public.mom_issues FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.meeting_moms m
  WHERE ((m.id = mom_issues.mom_id) AND (m.company_id = public.get_user_company_id())))));


--
-- Name: mom_issues mom_issues_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mom_issues_read ON public.mom_issues FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.meeting_moms m
  WHERE ((m.id = mom_issues.mom_id) AND (m.company_id = public.get_user_company_id())))));


--
-- Name: mom_issues mom_issues_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mom_issues_update ON public.mom_issues FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.meeting_moms m
  WHERE ((m.id = mom_issues.mom_id) AND (m.company_id = public.get_user_company_id())))));


--
-- Name: mom_progress_updates mom_progress_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mom_progress_delete ON public.mom_progress_updates FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.meeting_moms m
  WHERE ((m.id = mom_progress_updates.mom_id) AND (m.company_id = public.get_user_company_id())))));


--
-- Name: mom_progress_updates mom_progress_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mom_progress_insert ON public.mom_progress_updates FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.meeting_moms m
  WHERE ((m.id = mom_progress_updates.mom_id) AND (m.company_id = public.get_user_company_id())))));


--
-- Name: mom_progress_updates mom_progress_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mom_progress_read ON public.mom_progress_updates FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.meeting_moms m
  WHERE ((m.id = mom_progress_updates.mom_id) AND (m.company_id = public.get_user_company_id())))));


--
-- Name: mom_progress_updates mom_progress_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mom_progress_update ON public.mom_progress_updates FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.meeting_moms m
  WHERE ((m.id = mom_progress_updates.mom_id) AND (m.company_id = public.get_user_company_id())))));


--
-- Name: mom_progress_updates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mom_progress_updates ENABLE ROW LEVEL SECURITY;

--
-- Name: meeting_moms moms_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY moms_delete ON public.meeting_moms FOR DELETE USING (public.is_super_admin());


--
-- Name: meeting_moms moms_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY moms_insert ON public.meeting_moms FOR INSERT WITH CHECK ((company_id = public.get_user_company_id()));


--
-- Name: meeting_moms moms_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY moms_read ON public.meeting_moms FOR SELECT USING ((company_id = public.get_user_company_id()));


--
-- Name: meeting_moms moms_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY moms_update ON public.meeting_moms FOR UPDATE USING (((company_id = public.get_user_company_id()) AND (public.is_manager_or_above() OR (created_by = auth.uid()))));


--
-- Name: asset_network network_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY network_insert ON public.asset_network FOR INSERT WITH CHECK ((company_id = public.get_user_company_id()));


--
-- Name: asset_network network_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY network_select ON public.asset_network FOR SELECT USING ((public.is_super_admin() OR (company_id = public.get_user_company_id())));


--
-- Name: asset_network network_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY network_update ON public.asset_network FOR UPDATE USING ((company_id = public.get_user_company_id()));


--
-- Name: notification_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_rules notification_rules_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notification_rules_access ON public.notification_rules TO authenticated USING ((((company_id = public.get_user_company_id()) AND public.is_admin_or_above()) OR public.is_super_admin())) WITH CHECK ((((company_id = public.get_user_company_id()) AND public.is_admin_or_above()) OR public.is_super_admin()));


--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications notifications_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_delete ON public.notifications FOR DELETE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: notifications notifications_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_insert ON public.notifications FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: notifications notifications_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_read ON public.notifications FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: notifications notifications_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_update ON public.notifications FOR UPDATE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: payment_terms; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payment_terms ENABLE ROW LEVEL SECURITY;

--
-- Name: payment_terms payment_terms_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payment_terms_insert ON public.payment_terms FOR INSERT TO authenticated WITH CHECK (((company_id = public.get_user_company_id()) AND (public.is_admin_or_above() OR public.has_role('finance_controller'::text))));


--
-- Name: payment_terms payment_terms_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payment_terms_read ON public.payment_terms FOR SELECT TO authenticated USING (((company_id = public.get_user_company_id()) AND ((deleted_at IS NULL) OR public.is_super_admin())));


--
-- Name: payment_terms payment_terms_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payment_terms_update ON public.payment_terms FOR UPDATE TO authenticated USING (((company_id = public.get_user_company_id()) AND ((deleted_at IS NULL) OR public.is_super_admin()))) WITH CHECK (((company_id = public.get_user_company_id()) AND (public.is_admin_or_above() OR public.has_role('finance_controller'::text))));


--
-- Name: permissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;

--
-- Name: permissions permissions_read_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY permissions_read_all ON public.permissions FOR SELECT TO authenticated USING (true);


--
-- Name: permissions permissions_super_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY permissions_super_admin_write ON public.permissions TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--
-- Name: picking_list_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.picking_list_items ENABLE ROW LEVEL SECURITY;

--
-- Name: picking_list_materials; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.picking_list_materials ENABLE ROW LEVEL SECURITY;

--
-- Name: picking_lists; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.picking_lists ENABLE ROW LEVEL SECURITY;

--
-- Name: picking_lists picking_lists_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY picking_lists_delete ON public.picking_lists FOR DELETE TO authenticated USING (true);


--
-- Name: picking_lists picking_lists_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY picking_lists_insert ON public.picking_lists FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: picking_lists picking_lists_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY picking_lists_read ON public.picking_lists FOR SELECT TO authenticated USING (true);


--
-- Name: picking_lists picking_lists_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY picking_lists_update ON public.picking_lists FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: picking_list_items pli_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pli_delete ON public.picking_list_items FOR DELETE TO authenticated USING (true);


--
-- Name: picking_list_items pli_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pli_insert ON public.picking_list_items FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: picking_list_items pli_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pli_read ON public.picking_list_items FOR SELECT TO authenticated USING (true);


--
-- Name: picking_list_items pli_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pli_update ON public.picking_list_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: picking_list_materials plm_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY plm_delete ON public.picking_list_materials FOR DELETE TO authenticated USING (true);


--
-- Name: picking_list_materials plm_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY plm_insert ON public.picking_list_materials FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: picking_list_materials plm_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY plm_read ON public.picking_list_materials FOR SELECT TO authenticated USING (true);


--
-- Name: picking_list_materials plm_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY plm_update ON public.picking_list_materials FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: positions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;

--
-- Name: positions positions_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY positions_insert ON public.positions FOR INSERT WITH CHECK ((public.is_super_admin() OR (public.is_admin_or_above() AND (company_id = public.get_user_company_id()))));


--
-- Name: positions positions_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY positions_read ON public.positions FOR SELECT TO authenticated USING ((public.is_super_admin() OR ((company_id = public.get_user_company_id()) AND (deleted_at IS NULL))));


--
-- Name: positions positions_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY positions_update ON public.positions FOR UPDATE USING ((public.is_super_admin() OR (public.is_admin_or_above() AND (company_id = public.get_user_company_id())))) WITH CHECK ((public.is_super_admin() OR (public.is_admin_or_above() AND (company_id = public.get_user_company_id()))));


--
-- Name: product_price_history pph_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pph_read ON public.product_price_history FOR SELECT USING ((public.is_super_admin() OR (company_id = public.get_user_company_id())));


--
-- Name: prf; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.prf ENABLE ROW LEVEL SECURITY;

--
-- Name: prf_cost_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.prf_cost_items ENABLE ROW LEVEL SECURITY;

--
-- Name: prf_cost_items prf_cost_items_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY prf_cost_items_delete ON public.prf_cost_items FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.prf p
  WHERE ((p.id = prf_cost_items.prf_id) AND (public.is_super_admin() OR ((p.deleted_at IS NULL) AND (p.company_id = public.get_user_company_id()) AND public.has_role('procurement'::text) AND ((p.status)::text = 'SUBMITTED'::text)))))));


--
-- Name: prf_cost_items prf_cost_items_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY prf_cost_items_insert ON public.prf_cost_items FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.prf p
  WHERE ((p.id = prf_cost_items.prf_id) AND (public.is_super_admin() OR ((p.deleted_at IS NULL) AND (p.company_id = public.get_user_company_id()) AND public.has_role('procurement'::text) AND ((p.status)::text = 'SUBMITTED'::text)))))));


--
-- Name: prf_cost_items prf_cost_items_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY prf_cost_items_select ON public.prf_cost_items FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.prf p
  WHERE ((p.id = prf_cost_items.prf_id) AND (public.is_super_admin() OR ((p.company_id = public.get_user_company_id()) AND ((p.created_by = auth.uid()) OR public.has_role('procurement'::text) OR public.is_manager_or_above())))))));


--
-- Name: prf_cost_items prf_cost_items_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY prf_cost_items_update ON public.prf_cost_items FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.prf p
  WHERE ((p.id = prf_cost_items.prf_id) AND (public.is_super_admin() OR ((p.deleted_at IS NULL) AND (p.company_id = public.get_user_company_id()) AND public.has_role('procurement'::text) AND ((p.status)::text = 'SUBMITTED'::text))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.prf p
  WHERE ((p.id = prf_cost_items.prf_id) AND (public.is_super_admin() OR ((p.deleted_at IS NULL) AND (p.company_id = public.get_user_company_id()) AND public.has_role('procurement'::text) AND ((p.status)::text = 'SUBMITTED'::text)))))));


--
-- Name: prf prf_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY prf_insert ON public.prf FOR INSERT TO authenticated WITH CHECK ((public.is_super_admin() OR ((company_id = public.get_user_company_id()) AND (created_by = auth.uid()) AND (public.has_role('sales'::text) OR public.has_role('gm_bd'::text)))));


--
-- Name: prf prf_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY prf_select ON public.prf FOR SELECT TO authenticated USING ((public.is_super_admin() OR ((company_id = public.get_user_company_id()) AND ((created_by = auth.uid()) OR public.has_role('procurement'::text) OR public.is_manager_or_above()))));


--
-- Name: prf prf_update_draft; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY prf_update_draft ON public.prf FOR UPDATE TO authenticated USING ((public.is_super_admin() OR ((deleted_at IS NULL) AND (company_id = public.get_user_company_id()) AND (created_by = auth.uid()) AND ((status)::text = 'DRAFT'::text)))) WITH CHECK ((public.is_super_admin() OR ((company_id = public.get_user_company_id()) AND (created_by = auth.uid()))));


--
-- Name: prf prf_update_status; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY prf_update_status ON public.prf FOR UPDATE TO authenticated USING ((public.is_super_admin() OR ((deleted_at IS NULL) AND (company_id = public.get_user_company_id()) AND public.has_role('procurement'::text) AND ((status)::text = 'SUBMITTED'::text)))) WITH CHECK ((public.is_super_admin() OR (company_id = public.get_user_company_id())));


--
-- Name: product_price_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_price_history ENABLE ROW LEVEL SECURITY;

--
-- Name: product_warehouse_location; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_warehouse_location ENABLE ROW LEVEL SECURITY;

--
-- Name: products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

--
-- Name: products products_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY products_insert ON public.products FOR INSERT TO authenticated WITH CHECK (((company_id = public.get_user_company_id()) AND public.is_admin_or_above()));


--
-- Name: products products_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY products_read ON public.products FOR SELECT USING ((public.is_super_admin() OR ((company_id = public.get_user_company_id()) AND ((deleted_at IS NULL) OR public.is_super_admin()))));


--
-- Name: products products_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY products_update ON public.products FOR UPDATE TO authenticated USING ((public.is_super_admin() OR ((company_id = public.get_user_company_id()) AND ((deleted_at IS NULL) OR public.is_super_admin())))) WITH CHECK ((public.is_super_admin() OR ((company_id = public.get_user_company_id()) AND public.is_admin_or_above())));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_read ON public.profiles FOR SELECT TO authenticated USING (true);


--
-- Name: profiles profiles_read_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_read_own ON public.profiles FOR SELECT USING ((auth.uid() = id));


--
-- Name: profiles profiles_service_role_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_service_role_read ON public.profiles FOR SELECT USING ((auth.role() = 'service_role'::text));


--
-- Name: profiles profiles_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_update ON public.profiles FOR UPDATE TO authenticated USING (((id = auth.uid()) OR ((company_id = public.get_user_company_id()) AND public.is_admin_or_above()) OR public.is_super_admin())) WITH CHECK (((id = auth.uid()) OR ((company_id = public.get_user_company_id()) AND public.is_admin_or_above()) OR public.is_super_admin()));


--
-- Name: accounts prospects_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY prospects_insert ON public.accounts FOR INSERT WITH CHECK ((company_id = public.get_user_company_id()));


--
-- Name: accounts prospects_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY prospects_read ON public.accounts FOR SELECT USING ((public.is_super_admin() OR ((company_id = public.get_user_company_id()) AND (public.is_manager_or_above() OR (assigned_to = auth.uid()) OR (created_by = auth.uid()) OR (public.has_role('operations'::text) AND ((account_status)::text = 'customer'::text))))));


--
-- Name: accounts prospects_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY prospects_update ON public.accounts FOR UPDATE USING ((((company_id = public.get_user_company_id()) AND (public.is_manager_or_above() OR (assigned_to = auth.uid()) OR (created_by = auth.uid()))) OR public.is_super_admin()));


--
-- Name: product_warehouse_location pwl_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pwl_delete ON public.product_warehouse_location FOR DELETE TO authenticated USING (true);


--
-- Name: product_warehouse_location pwl_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pwl_insert ON public.product_warehouse_location FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: product_warehouse_location pwl_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pwl_read ON public.product_warehouse_location FOR SELECT TO authenticated USING (true);


--
-- Name: product_warehouse_location pwl_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pwl_update ON public.product_warehouse_location FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: quotation_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.quotation_items ENABLE ROW LEVEL SECURITY;

--
-- Name: quotation_items quotation_items_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY quotation_items_delete ON public.quotation_items FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.quotations q
  WHERE ((q.id = quotation_items.quotation_id) AND ((q.company_id = public.get_user_company_id()) OR public.is_super_admin())))));


--
-- Name: quotation_items quotation_items_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY quotation_items_insert ON public.quotation_items FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.quotations q
  WHERE ((q.id = quotation_items.quotation_id) AND ((q.company_id = public.get_user_company_id()) OR public.is_super_admin())))));


--
-- Name: quotation_items quotation_items_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY quotation_items_read ON public.quotation_items FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.quotations q
  WHERE ((q.id = quotation_items.quotation_id) AND ((q.company_id = public.get_user_company_id()) OR public.is_super_admin())))));


--
-- Name: quotation_items quotation_items_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY quotation_items_update ON public.quotation_items FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.quotations q
  WHERE ((q.id = quotation_items.quotation_id) AND ((q.company_id = public.get_user_company_id()) OR public.is_super_admin()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.quotations q
  WHERE ((q.id = quotation_items.quotation_id) AND ((q.company_id = public.get_user_company_id()) OR public.is_super_admin())))));


--
-- Name: quotations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;

--
-- Name: quotations quotations_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY quotations_insert ON public.quotations FOR INSERT TO authenticated WITH CHECK (((company_id = public.get_user_company_id()) OR public.is_super_admin()));


--
-- Name: quotations quotations_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY quotations_read ON public.quotations FOR SELECT USING ((((company_id = public.get_user_company_id()) AND (public.is_manager_or_above() OR (created_by = auth.uid()))) OR public.is_super_admin()));


--
-- Name: quotations quotations_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY quotations_update ON public.quotations FOR UPDATE USING ((((company_id = public.get_user_company_id()) AND (public.is_manager_or_above() OR (created_by = auth.uid()))) OR public.is_super_admin())) WITH CHECK ((((company_id = public.get_user_company_id()) AND (public.is_manager_or_above() OR (created_by = auth.uid()))) OR public.is_super_admin()));


--
-- Name: rate_sheets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rate_sheets ENABLE ROW LEVEL SECURITY;

--
-- Name: rate_sheets rate_sheets_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rate_sheets_delete ON public.rate_sheets FOR DELETE TO authenticated USING (((created_by = auth.uid()) OR public.is_manager_or_above()));


--
-- Name: rate_sheets rate_sheets_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rate_sheets_insert ON public.rate_sheets FOR INSERT TO authenticated WITH CHECK ((created_by = auth.uid()));


--
-- Name: rate_sheets rate_sheets_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rate_sheets_select ON public.rate_sheets FOR SELECT TO authenticated USING (((created_by = auth.uid()) OR public.is_manager_or_above()));


--
-- Name: rate_sheets rate_sheets_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rate_sheets_update ON public.rate_sheets FOR UPDATE TO authenticated USING ((((created_by = auth.uid()) OR public.is_manager_or_above()) AND ((valid_until IS NULL) OR (valid_until >= CURRENT_DATE)))) WITH CHECK ((((created_by = auth.uid()) OR public.is_manager_or_above()) AND ((valid_until IS NULL) OR (valid_until >= CURRENT_DATE))));


--
-- Name: role_permission_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.role_permission_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: role_permissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

--
-- Name: role_permissions role_permissions_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY role_permissions_delete ON public.role_permissions FOR DELETE TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.roles r
  WHERE ((r.id = role_permissions.role_id) AND (r.company_id = public.get_user_company_id())))) AND public.is_admin_or_above()));


--
-- Name: role_permissions role_permissions_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY role_permissions_insert ON public.role_permissions FOR INSERT TO authenticated WITH CHECK (((EXISTS ( SELECT 1
   FROM public.roles r
  WHERE ((r.id = role_permissions.role_id) AND (r.company_id = public.get_user_company_id())))) AND public.is_admin_or_above()));


--
-- Name: role_permissions role_permissions_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY role_permissions_read ON public.role_permissions FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.roles r
  WHERE ((r.id = role_permissions.role_id) AND (r.company_id = public.get_user_company_id())))));


--
-- Name: roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

--
-- Name: roles roles_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY roles_insert ON public.roles FOR INSERT TO authenticated WITH CHECK (((company_id = public.get_user_company_id()) AND public.is_admin_or_above()));


--
-- Name: roles roles_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY roles_read ON public.roles FOR SELECT TO authenticated USING ((public.is_super_admin() OR ((company_id = public.get_user_company_id()) AND (deleted_at IS NULL))));


--
-- Name: roles roles_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY roles_update ON public.roles FOR UPDATE TO authenticated USING (((company_id = public.get_user_company_id()) AND public.is_admin_or_above())) WITH CHECK (((company_id = public.get_user_company_id()) AND public.is_admin_or_above()));


--
-- Name: role_permission_templates rpt_admin_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rpt_admin_only ON public.role_permission_templates TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--
-- Name: role_permission_templates rpt_read_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rpt_read_all ON public.role_permission_templates FOR SELECT USING (true);


--
-- Name: sales_calls; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sales_calls ENABLE ROW LEVEL SECURITY;

--
-- Name: sales_calls sales_calls_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sales_calls_delete ON public.sales_calls FOR DELETE USING (((company_id = public.get_user_company_id()) AND public.is_manager_or_above()));


--
-- Name: sales_calls sales_calls_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sales_calls_insert ON public.sales_calls FOR INSERT WITH CHECK ((company_id = public.get_user_company_id()));


--
-- Name: sales_calls sales_calls_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sales_calls_read ON public.sales_calls FOR SELECT USING ((((company_id = public.get_user_company_id()) AND (public.is_manager_or_above() OR (salesperson_id = auth.uid()) OR (created_by = auth.uid()))) OR public.is_super_admin()));


--
-- Name: sales_calls sales_calls_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sales_calls_update ON public.sales_calls FOR UPDATE USING (((company_id = public.get_user_company_id()) AND (public.is_manager_or_above() OR (salesperson_id = auth.uid()) OR (created_by = auth.uid()))));


--
-- Name: sales_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sales_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: sales_orders_backup_20260722; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sales_orders_backup_20260722 ENABLE ROW LEVEL SECURITY;

--
-- Name: sales_orders sales_orders_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sales_orders_delete ON public.sales_orders FOR DELETE TO authenticated USING ((public.is_super_admin() OR ((company_id = public.get_user_company_id()) AND (created_by = auth.uid()))));


--
-- Name: sales_orders sales_orders_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sales_orders_insert ON public.sales_orders FOR INSERT TO authenticated WITH CHECK ((public.is_super_admin() OR ((company_id = public.get_user_company_id()) AND (created_by = auth.uid()) AND (public.has_role('sales'::text) OR public.has_role('gm_bd'::text)))));


--
-- Name: sales_orders sales_orders_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sales_orders_select ON public.sales_orders FOR SELECT TO authenticated USING ((public.is_super_admin() OR ((company_id = public.get_user_company_id()) AND ((created_by = auth.uid()) OR public.has_role('procurement'::text) OR public.is_manager_or_above()))));


--
-- Name: sales_orders sales_orders_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sales_orders_update ON public.sales_orders FOR UPDATE TO authenticated USING ((public.is_super_admin() OR ((deleted_at IS NULL) AND (company_id = public.get_user_company_id()) AND (created_by = auth.uid())))) WITH CHECK ((public.is_super_admin() OR ((company_id = public.get_user_company_id()) AND (created_by = auth.uid()))));


--
-- Name: sales_visit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sales_visit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: sales_visits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sales_visits ENABLE ROW LEVEL SECURITY;

--
-- Name: sales_visits sales_visits_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sales_visits_delete ON public.sales_visits FOR DELETE USING (((company_id = public.get_user_company_id()) AND public.is_manager_or_above()));


--
-- Name: sales_visits sales_visits_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sales_visits_insert ON public.sales_visits FOR INSERT WITH CHECK ((company_id = public.get_user_company_id()));


--
-- Name: sales_visits sales_visits_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sales_visits_read ON public.sales_visits FOR SELECT USING ((((company_id = public.get_user_company_id()) AND (public.is_manager_or_above() OR (salesperson_id = auth.uid()) OR (created_by = auth.uid()))) OR public.is_super_admin()));


--
-- Name: sales_visits sales_visits_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sales_visits_update ON public.sales_visits FOR UPDATE USING (((company_id = public.get_user_company_id()) AND (public.is_manager_or_above() OR (salesperson_id = auth.uid()) OR (created_by = auth.uid()))));


--
-- Name: asset_software_licenses software_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY software_insert ON public.asset_software_licenses FOR INSERT WITH CHECK ((company_id = public.get_user_company_id()));


--
-- Name: asset_software_licenses software_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY software_select ON public.asset_software_licenses FOR SELECT USING ((public.is_super_admin() OR (company_id = public.get_user_company_id())));


--
-- Name: asset_software_licenses software_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY software_update ON public.asset_software_licenses FOR UPDATE USING ((company_id = public.get_user_company_id()));


--
-- Name: sp_btb; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sp_btb ENABLE ROW LEVEL SECURITY;

--
-- Name: sp_btb sp_btb_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sp_btb_delete ON public.sp_btb FOR DELETE USING (public.is_super_admin());


--
-- Name: sp_btb sp_btb_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sp_btb_insert ON public.sp_btb FOR INSERT WITH CHECK ((public.is_super_admin() OR ((company_id = public.get_user_company_id()) AND (public.is_manager_or_above() OR public.has_role('operations'::text)))));


--
-- Name: sp_btb sp_btb_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sp_btb_read ON public.sp_btb FOR SELECT USING ((public.is_super_admin() OR (company_id = public.get_user_company_id())));


--
-- Name: sp_btb sp_btb_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sp_btb_update ON public.sp_btb FOR UPDATE USING ((public.is_super_admin() OR ((company_id = public.get_user_company_id()) AND (public.is_manager_or_above() OR public.has_role('operations'::text)))));


--
-- Name: sp_btbs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sp_btbs ENABLE ROW LEVEL SECURITY;

--
-- Name: sp_btbs sp_btbs_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sp_btbs_delete ON public.sp_btbs FOR DELETE TO authenticated USING (true);


--
-- Name: sp_btbs sp_btbs_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sp_btbs_insert ON public.sp_btbs FOR INSERT WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: sp_btbs sp_btbs_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sp_btbs_read ON public.sp_btbs FOR SELECT USING (true);


--
-- Name: sp_btbs sp_btbs_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sp_btbs_update ON public.sp_btbs FOR UPDATE USING ((auth.uid() IS NOT NULL));


--
-- Name: sp_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sp_items ENABLE ROW LEVEL SECURITY;

--
-- Name: sp_items sp_items_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sp_items_delete ON public.sp_items FOR DELETE TO authenticated USING (true);


--
-- Name: sp_items sp_items_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sp_items_insert ON public.sp_items FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: sp_items sp_items_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sp_items_read ON public.sp_items FOR SELECT TO authenticated USING (true);


--
-- Name: sp_items sp_items_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sp_items_update ON public.sp_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: sp_order_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sp_order_items ENABLE ROW LEVEL SECURITY;

--
-- Name: sp_order_items sp_order_items_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sp_order_items_delete ON public.sp_order_items FOR DELETE USING (public.is_super_admin());


--
-- Name: sp_order_items sp_order_items_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sp_order_items_insert ON public.sp_order_items FOR INSERT WITH CHECK ((public.is_super_admin() OR ((company_id = public.get_user_company_id()) AND (public.is_manager_or_above() OR public.has_role('operations'::text)))));


--
-- Name: sp_order_items sp_order_items_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sp_order_items_read ON public.sp_order_items FOR SELECT USING ((public.is_super_admin() OR (company_id = public.get_user_company_id())));


--
-- Name: sp_order_items sp_order_items_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sp_order_items_update ON public.sp_order_items FOR UPDATE USING ((public.is_super_admin() OR ((company_id = public.get_user_company_id()) AND (public.is_manager_or_above() OR public.has_role('operations'::text)))));


--
-- Name: sp_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sp_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: sp_orders sp_orders_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sp_orders_delete ON public.sp_orders FOR DELETE USING (public.is_super_admin());


--
-- Name: sp_orders sp_orders_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sp_orders_insert ON public.sp_orders FOR INSERT WITH CHECK ((public.is_super_admin() OR ((company_id = public.get_user_company_id()) AND (public.is_manager_or_above() OR public.has_role('operations'::text)))));


--
-- Name: sp_orders sp_orders_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sp_orders_read ON public.sp_orders FOR SELECT USING ((public.is_super_admin() OR (company_id = public.get_user_company_id())));


--
-- Name: sp_orders sp_orders_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sp_orders_update ON public.sp_orders FOR UPDATE USING ((public.is_super_admin() OR ((company_id = public.get_user_company_id()) AND (public.is_manager_or_above() OR public.has_role('operations'::text)))));


--
-- Name: asset_specifications specs_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY specs_insert ON public.asset_specifications FOR INSERT WITH CHECK ((company_id = public.get_user_company_id()));


--
-- Name: asset_specifications specs_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY specs_select ON public.asset_specifications FOR SELECT USING ((public.is_super_admin() OR (company_id = public.get_user_company_id())));


--
-- Name: asset_specifications specs_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY specs_update ON public.asset_specifications FOR UPDATE USING ((company_id = public.get_user_company_id()));


--
-- Name: status_catalog; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.status_catalog ENABLE ROW LEVEL SECURITY;

--
-- Name: status_catalog status_catalog_read_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY status_catalog_read_all ON public.status_catalog FOR SELECT TO authenticated USING (true);


--
-- Name: status_catalog status_catalog_super_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY status_catalog_super_admin_write ON public.status_catalog TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--
-- Name: stock_ledger; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stock_ledger ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_ledger stock_ledger_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stock_ledger_insert ON public.stock_ledger FOR INSERT WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: stock_ledger stock_ledger_modify; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stock_ledger_modify ON public.stock_ledger FOR UPDATE USING (public.is_super_admin());


--
-- Name: stock_ledger stock_ledger_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stock_ledger_select ON public.stock_ledger FOR SELECT USING (true);


--
-- Name: taxes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.taxes ENABLE ROW LEVEL SECURITY;

--
-- Name: taxes taxes_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY taxes_insert ON public.taxes FOR INSERT TO authenticated WITH CHECK (((company_id = public.get_user_company_id()) AND (public.is_admin_or_above() OR public.has_role('finance_controller'::text))));


--
-- Name: taxes taxes_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY taxes_read ON public.taxes FOR SELECT TO authenticated USING (((company_id = public.get_user_company_id()) AND ((deleted_at IS NULL) OR public.is_super_admin())));


--
-- Name: taxes taxes_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY taxes_update ON public.taxes FOR UPDATE TO authenticated USING (((company_id = public.get_user_company_id()) AND ((deleted_at IS NULL) OR public.is_super_admin()))) WITH CHECK (((company_id = public.get_user_company_id()) AND (public.is_admin_or_above() OR public.has_role('finance_controller'::text))));


--
-- Name: top_requests top_request_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY top_request_read ON public.top_requests FOR SELECT USING ((company_id = public.get_user_company_id()));


--
-- Name: top_requests top_request_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY top_request_update ON public.top_requests FOR UPDATE USING (((company_id = public.get_user_company_id()) AND (public.is_manager_or_above() OR (created_by = auth.uid()))));


--
-- Name: top_requests top_request_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY top_request_write ON public.top_requests FOR INSERT WITH CHECK ((company_id = public.get_user_company_id()));


--
-- Name: top_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.top_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: user_menu_permissions ump_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ump_admin_all ON public.user_menu_permissions TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--
-- Name: user_menu_permissions ump_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ump_select ON public.user_menu_permissions FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: user_login_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_login_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: user_login_logs user_login_logs_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_login_logs_read ON public.user_login_logs FOR SELECT TO authenticated USING ((public.is_super_admin() OR (user_id = auth.uid()) OR (public.is_manager_or_above() AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = user_login_logs.user_id) AND (p.company_id = public.get_user_company_id())))))));


--
-- Name: user_menu_permissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_menu_permissions ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles user_roles_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_roles_insert ON public.user_roles FOR INSERT TO authenticated WITH CHECK (((company_id = public.get_user_company_id()) AND public.is_admin_or_above()));


--
-- Name: user_roles user_roles_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_roles_read ON public.user_roles FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR ((company_id = public.get_user_company_id()) AND public.is_manager_or_above()) OR public.is_super_admin()));


--
-- Name: user_roles user_roles_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_roles_update ON public.user_roles FOR UPDATE TO authenticated USING (((company_id = public.get_user_company_id()) AND public.is_admin_or_above())) WITH CHECK (((company_id = public.get_user_company_id()) AND public.is_admin_or_above()));


--
-- Name: vendors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;

--
-- Name: vendors vendors_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vendors_delete ON public.vendors FOR DELETE TO authenticated USING (public.is_super_admin());


--
-- Name: vendors vendors_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vendors_insert ON public.vendors FOR INSERT TO authenticated WITH CHECK ((public.is_super_admin() OR ((company_id = public.get_user_company_id()) AND (public.is_manager_or_above() OR public.has_role('procurement'::text)))));


--
-- Name: vendors vendors_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vendors_select ON public.vendors FOR SELECT TO authenticated USING ((public.is_super_admin() OR (company_id = public.get_user_company_id())));


--
-- Name: vendors vendors_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vendors_update ON public.vendors FOR UPDATE TO authenticated USING ((public.is_super_admin() OR ((company_id = public.get_user_company_id()) AND (deleted_at IS NULL) AND (public.is_manager_or_above() OR public.has_role('procurement'::text))))) WITH CHECK ((public.is_super_admin() OR ((company_id = public.get_user_company_id()) AND (public.is_manager_or_above() OR public.has_role('procurement'::text)))));


--
-- Name: sales_visit_logs visit_logs_company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY visit_logs_company ON public.sales_visit_logs USING ((visit_id IN ( SELECT sales_visits.id
   FROM public.sales_visits
  WHERE (sales_visits.company_id = public.get_user_company_id()))));


--
-- Name: warehouses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;

--
-- Name: warehouses warehouses_modify; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY warehouses_modify ON public.warehouses USING (public.is_super_admin());


--
-- Name: warehouses warehouses_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY warehouses_select ON public.warehouses FOR SELECT USING (true);


--
-- PostgreSQL database dump complete
--

\unrestrict NwE6g12cmFAf077KvIXnrcvczeUiDiv3UX2NsgISr02aRLSq38gOcum9bW0DyCf

