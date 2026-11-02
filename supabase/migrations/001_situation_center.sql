-- Run once in a dedicated Supabase project. No service_role key is used by the app.
begin;
create extension if not exists postgis with schema extensions;
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null default 'Пользователь' check(length(display_name) between 1 and 120),
 role text not null default 'observer' check(role in ('admin','operator','observer'))
);
create function public.current_role() returns text language sql stable security definer set search_path = '' as $$
 select role from public.profiles where id = auth.uid()
$$;
create function public.new_profile() returns trigger language plpgsql security definer set search_path = '' as $$
begin insert into public.profiles(id) values(new.id); return new; end $$;
create trigger new_auth_user after insert on auth.users for each row execute function public.new_profile();
insert into public.profiles(id) select id from auth.users on conflict do nothing;

create table public.events (
 id uuid primary key default gen_random_uuid(),
 title text not null check(length(title) between 3 and 180), description text not null check(length(description) between 3 and 4000),
 category text not null check(category in ('ДТП','Дорожная ситуация','Авария инфраструктуры','Пожар','Чрезвычайная ситуация','Общественный порядок','Другое')),
 district text not null check(district in ('Алатауский','Алмалинский','Ауэзовский','Бостандыкский','Жетысуский','Медеуский','Наурызбайский','Турксибский')),
 latitude double precision not null check(latitude between 42.8 and 43.6), longitude double precision not null check(longitude between 76.5 and 77.3),
 location extensions.geography(point,4326) generated always as (extensions.st_setsrid(extensions.st_makepoint(longitude,latitude),4326)::extensions.geography) stored,
 occurred_at timestamptz not null,
 priority text not null check(priority in ('Низкий','Средний','Высокий')),
 status text not null check(status in ('Новое','Проверяется','Подтверждено','В работе','Закрыто')),
 is_demo boolean not null default true, source text not null check(length(source) between 3 and 500),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version integer not null default 1
);
create index events_location on public.events using gist(location);
create index events_time_district on public.events(occurred_at desc,district);
create table public.cameras (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 3 and 180),
 district text not null check(district in ('Алатауский','Алмалинский','Ауэзовский','Бостандыкский','Жетысуский','Медеуский','Наурызбайский','Турксибский')),
 address text not null check(length(address) between 3 and 300),
 type text not null check(type in ('Дорожная','Городская','Общественное пространство','Транспортный узел','Туристическая')),
 stream_url text not null check(stream_url ~ '^https://[^/@]+/.*\.m3u8(\?.*)?$'), source_url text not null check(source_url ~ '^https://'),
 latitude double precision, longitude double precision,
 location_note text not null check(length(location_note) between 3 and 500),
 status text not null default 'Не проверена' check(status in ('Не проверена','Отключена')),
 checked_at timestamptz, is_demo boolean not null default false,
 check((latitude is null and longitude is null) or (latitude is not null and longitude is not null and latitude between 42.8 and 43.6 and longitude between 76.5 and 77.3))
);
insert into public.cameras(name,district,address,type,stream_url,source_url,location_note) values
 ('Базовая станция','Медеуский','Горный курорт Шымбулак','Туристическая','https://ipcam.kz:443/cam1/index.m3u8','https://shymbulak.com/live/','Точное место установки не подтверждено; ориентир курорта.'),
 ('Средняя станция','Медеуский','Горный курорт Шымбулак','Туристическая','https://ipcam.kz:443/cam5/index.m3u8','https://shymbulak.com/live/','Точное место установки не подтверждено; ориентир курорта.'),
 ('Ледник Богдановича','Медеуский','Горный курорт Шымбулак','Туристическая','https://ipcam.kz:443/cam6/index.m3u8','https://shymbulak.com/live/','Точное место установки не подтверждено; ориентир курорта.');
create table public.audit_log (
 id uuid primary key default gen_random_uuid(), entity_id uuid not null, entity_type text not null,
 action text not null, actor uuid, created_at timestamptz not null default now(), before_data jsonb, after_data jsonb
);
create index audit_entity_time on public.audit_log(entity_id,created_at desc);
create function public.event_version() returns trigger language plpgsql set search_path = '' as $$
begin
 if TG_OP = 'INSERT' then new.created_at = now(); new.version = 1;
 else new.created_at = old.created_at; new.version = old.version + 1; end if;
 new.updated_at = now(); return new;
end $$;
create trigger events_version before insert or update on public.events for each row execute function public.event_version();
create function public.audit_change() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into public.audit_log(entity_id,entity_type,action,actor,before_data,after_data)
 values(new.id,TG_TABLE_NAME,TG_OP,auth.uid(),case when TG_OP='UPDATE' then to_jsonb(old)-'location' else null end,to_jsonb(new)-'location');
 return new;
end $$;
create trigger events_audit after insert or update on public.events for each row execute function public.audit_change();
create trigger cameras_audit after insert or update on public.cameras for each row execute function public.audit_change();
create trigger profiles_audit after insert or update on public.profiles for each row execute function public.audit_change();

alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.cameras enable row level security;
alter table public.audit_log enable row level security;
create policy profiles_read on public.profiles for select to authenticated using(id=auth.uid() or public.current_role()='admin');
create policy profiles_admin on public.profiles for update to authenticated using(public.current_role()='admin') with check(public.current_role()='admin');
create policy events_read on public.events for select to authenticated using(public.current_role() is not null);
create policy events_add on public.events for insert to authenticated with check(public.current_role() in ('admin','operator'));
create policy events_edit on public.events for update to authenticated using(public.current_role() in ('admin','operator')) with check(public.current_role() in ('admin','operator'));
create policy cameras_read on public.cameras for select to authenticated using(public.current_role() is not null);
create policy cameras_add on public.cameras for insert to authenticated with check(public.current_role()='admin');
create policy cameras_edit on public.cameras for update to authenticated using(public.current_role()='admin') with check(public.current_role()='admin');
create policy audit_read on public.audit_log for select to authenticated using(public.current_role() is not null and (entity_type <> 'profiles' or public.current_role()='admin'));
revoke all on public.events,public.cameras,public.profiles,public.audit_log from anon,authenticated;
grant select,insert on public.events,public.cameras to authenticated;
grant update(title,description,category,district,latitude,longitude,occurred_at,priority,status,is_demo,source) on public.events to authenticated;
grant update(name,district,address,type,stream_url,source_url,latitude,longitude,location_note,status,is_demo) on public.cameras to authenticated;
grant select on public.profiles,public.audit_log to authenticated;
grant update(display_name,role) on public.profiles to authenticated;

-- Durable, atomic per-user quotas across serverless instances. Fail closed.
create table public.ai_usage (user_id uuid not null references auth.users(id) on delete cascade, bucket timestamptz not null, total integer not null, primary key(user_id,bucket));
alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon,authenticated;
create function public.consume_ai_quota() returns boolean language plpgsql security definer set search_path = '' as $$
declare minute_count integer; day_count integer; who uuid := auth.uid();
begin
 if who is null or public.current_role() is null then return false; end if;
 perform pg_advisory_xact_lock(hashtext(who::text));
 select coalesce(sum(total),0) into day_count from public.ai_usage where user_id=who and bucket >= date_trunc('day',now());
 select coalesce(sum(total),0) into minute_count from public.ai_usage where user_id=who and bucket >= date_trunc('minute',now());
 if day_count >= 30 or minute_count >= 5 then return false; end if;
 insert into public.ai_usage values(who,date_trunc('minute',now()),1) on conflict(user_id,bucket) do update set total=public.ai_usage.total+1;
 delete from public.ai_usage where user_id=who and bucket < now()-interval '2 days';
 return true;
end $$;
revoke all on function public.current_role(),public.consume_ai_quota(),public.new_profile(),public.audit_change(),public.event_version() from public;
grant execute on function public.current_role(),public.consume_ai_quota() to authenticated;
commit;
