create type public.app_role as enum ('admin','cashier');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;
create or replace function public.is_staff(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id)
$$;

create policy "own roles or admin" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "admin delete roles" on public.user_roles for delete to authenticated
  using (public.has_role(auth.uid(),'admin'));

-- first user becomes admin
create or replace function public.handle_first_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.user_roles where role = 'admin') then
    insert into public.user_roles(user_id, role) values (new.id, 'admin');
  end if;
  return new;
end $$;
create trigger on_auth_user_created_role after insert on auth.users
  for each row execute function public.handle_first_user();

-- admin assigns role by email
create or replace function public.assign_role_by_email(_email text, _role app_role)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if not public.has_role(auth.uid(),'admin') then raise exception 'Not allowed'; end if;
  select id into uid from auth.users where lower(email) = lower(_email);
  if uid is null then raise exception 'No account with that email. Ask them to sign up first.'; end if;
  insert into public.user_roles(user_id, role) values (uid, _role) on conflict do nothing;
end $$;

create or replace function public.list_staff()
returns table(role_id uuid, user_id uuid, email text, role app_role)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(),'admin') then raise exception 'Not allowed'; end if;
  return query select r.id, r.user_id, u.email::text, r.role from public.user_roles r join auth.users u on u.id = r.user_id order by u.email;
end $$;

-- rooms
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text not null default '',
  price numeric(10,2) not null default 0,
  capacity int not null default 2,
  bathroom text not null default 'Attached',
  ac boolean not null default true,
  wifi boolean not null default true,
  image_url text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
grant select on public.rooms to anon, authenticated;
grant insert, update, delete on public.rooms to authenticated;
grant all on public.rooms to service_role;
alter table public.rooms enable row level security;
create policy "public read active rooms" on public.rooms for select to anon, authenticated using (active or public.is_staff(auth.uid()));
create policy "admin manage rooms" on public.rooms for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

-- bookings
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  guest_name text not null,
  guest_email text not null,
  guest_phone text not null,
  check_in date not null,
  check_out date not null,
  guests int not null default 1,
  notes text,
  total numeric(10,2) not null default 0,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);
grant insert on public.bookings to anon, authenticated;
grant select, update, delete on public.bookings to authenticated;
grant all on public.bookings to service_role;
alter table public.bookings enable row level security;
create policy "anyone can request booking" on public.bookings for insert to anon, authenticated with check (status = 'pending');
create policy "admin read bookings" on public.bookings for select to authenticated using (public.has_role(auth.uid(),'admin'));
create policy "admin update bookings" on public.bookings for update to authenticated using (public.has_role(auth.uid(),'admin'));
create policy "admin delete bookings" on public.bookings for delete to authenticated using (public.has_role(auth.uid(),'admin'));

create or replace function public.validate_booking()
returns trigger language plpgsql set search_path = public as $$
declare p numeric; nights int;
begin
  if new.check_out <= new.check_in then raise exception 'Check-out must be after check-in'; end if;
  if tg_op = 'INSERT' then
    if new.check_in < current_date then raise exception 'Check-in cannot be in the past'; end if;
    select price into p from public.rooms where id = new.room_id;
    nights := new.check_out - new.check_in;
    new.total := p * nights;
  end if;
  if new.status in ('pending','confirmed') and exists (
    select 1 from public.bookings b where b.room_id = new.room_id and b.id <> new.id
      and b.status in ('confirmed','checked_in')
      and b.check_in < new.check_out and b.check_out > new.check_in) then
    raise exception 'Room is not available for those dates';
  end if;
  return new;
end $$;
create trigger bookings_validate before insert or update on public.bookings for each row execute function public.validate_booking();

-- public availability check (no guest data)
create or replace function public.room_booked_ranges(_room uuid)
returns table(check_in date, check_out date) language sql stable security definer set search_path = public as $$
  select check_in, check_out from public.bookings where room_id = _room and status in ('confirmed','checked_in') and check_out >= current_date
$$;

-- menu
create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'Mains',
  price numeric(10,2) not null default 0,
  description text not null default '',
  available boolean not null default true,
  created_at timestamptz not null default now()
);
grant select on public.menu_items to anon, authenticated;
grant insert, update, delete on public.menu_items to authenticated;
grant all on public.menu_items to service_role;
alter table public.menu_items enable row level security;
create policy "public read menu" on public.menu_items for select to anon, authenticated using (true);
create policy "admin manage menu" on public.menu_items for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

-- orders
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_no serial,
  order_type text not null default 'dine_in',
  table_no text,
  room_code text,
  subtotal numeric(10,2) not null default 0,
  discount numeric(10,2) not null default 0,
  service_charge numeric(10,2) not null default 0,
  total numeric(10,2) not null default 0,
  payment_method text not null default 'cash',
  status text not null default 'paid',
  cashier_id uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  menu_item_id uuid references public.menu_items(id) on delete set null,
  name text not null,
  price numeric(10,2) not null,
  qty int not null default 1
);
grant select, insert, update, delete on public.orders, public.order_items to authenticated;
grant usage on sequence public.orders_order_no_seq to authenticated;
grant all on public.orders, public.order_items to service_role;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
create policy "staff orders" on public.orders for select to authenticated using (public.is_staff(auth.uid()));
create policy "staff create orders" on public.orders for insert to authenticated with check (public.is_staff(auth.uid()));
create policy "admin update orders" on public.orders for update to authenticated using (public.has_role(auth.uid(),'admin'));
create policy "admin delete orders" on public.orders for delete to authenticated using (public.has_role(auth.uid(),'admin'));
create policy "staff items" on public.order_items for select to authenticated using (public.is_staff(auth.uid()));
create policy "staff create items" on public.order_items for insert to authenticated with check (public.is_staff(auth.uid()));

-- seed
insert into public.rooms (code,name,description,price,capacity,bathroom,ac,wifi,image_url) values
('R206','Double Bed Room','A calm, well-appointed double room with handcrafted teak furniture and soft linen.',10000,2,'Attached',true,false,'/images/room-double.jpg'),
('R205','Single Bed Room','An intimate retreat for the solo traveller, warm light and quiet comfort.',11000,2,'Shared',true,false,'/images/room-single.jpg'),
('R204','Deluxe Double Room','Spacious double room with a private sitting nook and garden views.',13000,2,'Attached',true,false,'/images/room-double.jpg'),
('R202','King Size Room','A generous king bed, rich textures and a serene atmosphere for deep rest.',11000,2,'Attached',true,false,'/images/room-king.jpg'),
('R201','Classic Double Room','Our classic double — timeless, tidy and thoughtfully furnished.',10000,2,'Attached',true,false,'/images/room-king.jpg'),
('R104','Family Room','Room for the whole family, with high-speed WiFi and an airy layout.',14000,3,'Attached',true,true,'/images/room-family.jpg');

insert into public.menu_items (name,category,price,description) values
('Jaffna Crab Curry','Mains',3200,'Lagoon crab in roasted Jaffna spice'),
('Mutton Kothu Roti','Mains',1800,'Chopped godamba roti, spiced mutton'),
('Seafood Fried Rice','Mains',1900,'Prawns, cuttlefish, egg'),
('String Hoppers Set','Breakfast',900,'With dhal, pol sambol and curry'),
('Thosai with Sambar','Breakfast',700,'Crisp thosai, coconut chutney'),
('Odiyal Kool','Soups',1500,'Traditional Jaffna seafood broth'),
('Vadai (2 pcs)','Snacks',350,'Crispy lentil fritters'),
('Watalappan','Desserts',650,'Jaggery coconut custard'),
('Fresh Lime Juice','Drinks',450,'Freshly squeezed'),
('Ceylon Tea','Drinks',300,'Highland black tea'),
('Palmyra Toddy Mocktail','Drinks',800,'Palmyra, lime, mint');