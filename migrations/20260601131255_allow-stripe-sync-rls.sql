-- Allow the Electron Stripe sync flow to upsert client and subscription data through the anon API.
-- The app currently performs sync from the Electron main process with the configured anon key.

create policy "Enable insert for all" on public.clients
  for insert
  to public
  with check (true);

create policy "Enable update for all" on public.clients
  for update
  to public
  using (true)
  with check (true);

create policy "Enable insert for all" on public.subscriptions
  for insert
  to public
  with check (true);

create policy "Enable update for all" on public.subscriptions
  for update
  to public
  using (true)
  with check (true);