create table if not exists public.be_field_live_position_v1 (
 auth_user_id uuid primary key references auth.users(id) on delete cascade,
 worker_code text not null,
 role_code text not null,
 wayplan_id text not null,
 latitude numeric not null check (latitude between -90 and 90),
 longitude numeric not null check (longitude between -180 and 180),
 accuracy_m numeric check (accuracy_m between 0 and 1000),
 last_seen_at timestamptz not null default now(),
 expires_at timestamptz not null default (now() + interval '2 minutes')
);
alter table public.be_field_live_position_v1 enable row level security;
revoke all on public.be_field_live_position_v1 from public, anon, authenticated;
create or replace function public.be_field_live_position_update_v1(
 p_wayplan_id text, p_latitude numeric default null, p_longitude numeric default null,
 p_accuracy_m numeric default null, p_stop boolean default false)
returns jsonb language plpgsql security definer
set search_path = 'public','auth','pg_temp'
as $fn$
declare v_identity jsonb; v_uid uuid := auth.uid();
declare v_jobs jsonb; v_allowed boolean := false; v_code text; v_role text;
begin
 if v_uid is null then raise exception 'AUTHENTICATED_SESSION_REQUIRED' using errcode='42501'; end if;
 v_identity := public.be_current_field_team_identity();
 v_code := upper(v_identity->>'worker_code'); v_role := lower(v_identity->>'role');
 if v_role not in ('driver','helper','rider') then
   raise exception 'FIELD_ROLE_REQUIRED' using errcode='42501';
 end if;
 if p_stop then
   delete from public.be_field_live_position_v1 where auth_user_id = v_uid;
   return jsonb_build_object('ok',true,'sharing',false);
 end if;
 if p_wayplan_id is null or length(trim(p_wayplan_id))=0 or length(p_wayplan_id)>150 then
   raise exception 'WAYPLAN_REQUIRED' using errcode='22023';
 end if;
 if p_latitude is null or p_longitude is null or p_latitude not between -90 and 90
  or p_longitude not between -180 and 180 or (p_latitude=0 and p_longitude=0)
  or p_accuracy_m is null or p_accuracy_m < 0 or p_accuracy_m > 250 then
   raise exception 'VALID_PRECISE_GPS_REQUIRED' using errcode='22023';
 end if;
 v_jobs := public.be_rider_delivery_wayplan_jobs_v187(null,500);
 if coalesce(v_jobs->>'ok','false')<>'true' then
   raise exception 'ASSIGNMENTS_UNAVAILABLE' using errcode='42501';
 end if;
 select exists (
  select 1 from jsonb_array_elements(coalesce(v_jobs->'jobs','[]'::jsonb)) job
  where job->>'wayplan_id' = p_wayplan_id
 ) into v_allowed;
 if not v_allowed then raise exception 'ASSIGNED_ACTIVE_WAYPLAN_REQUIRED' using errcode='42501'; end if;
 insert into public.be_field_live_position_v1(auth_user_id,worker_code,role_code,wayplan_id,latitude,longitude,accuracy_m,last_seen_at,expires_at)
 values(v_uid,v_code,v_role,p_wayplan_id,p_latitude,p_longitude,p_accuracy_m,now(),now()+interval '2 minutes')
 on conflict (auth_user_id) do update set worker_code=excluded.worker_code,role_code=excluded.role_code,
 wayplan_id=excluded.wayplan_id,latitude=excluded.latitude,longitude=excluded.longitude,
 accuracy_m=excluded.accuracy_m,last_seen_at=now(),expires_at=now()+interval '2 minutes';
 return jsonb_build_object('ok',true,'sharing',true,'wayplan_id',p_wayplan_id,'expires_at',now()+interval '2 minutes');
end $fn$;
revoke all on function public.be_field_live_position_update_v1(text,numeric,numeric,numeric,boolean) from public,anon;
grant execute on function public.be_field_live_position_update_v1(text,numeric,numeric,numeric,boolean) to authenticated;