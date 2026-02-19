const BASE_URL = 'http://localhost:3000/api/v1';

async function run() {
  console.log('--- Starting Messaging Verification (fetch) ---');

  // 1. Create a Draft Message
  console.log('\n[1] Creating Draft Message...');
  const createRes = await fetch(`${BASE_URL}/admin/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer admin-token-placeholder' },
    body: JSON.stringify({
      title: 'Debug Simulation Message',
      body: 'This is a test message to verify the end-to-end flow.',
      type: 'info',
      audience_rules: {},
      publish_at: new Date().toISOString(),
      expire_at: new Date(Date.now() + 86400000).toISOString()
    })
  });
  
  const createData = await createRes.json(); // Explicitly typed as any in TS via usage
  if (!createRes.ok) throw new Error(JSON.stringify(createData));
  
  const messageId = createData.id;
  console.log(`✓ Created Message ID: ${messageId} (Status: ${createData.status})`);

  // 2. Publish the Message
  console.log(`\n[2] Publishing Message ${messageId}...`);
  const publishRes = await fetch(`${BASE_URL}/admin/messages/${messageId}/publish`, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer admin-token-placeholder' }
  });
  const publishData = await publishRes.json();
  if (!publishRes.ok) throw new Error(JSON.stringify(publishData));
  
  console.log(`✓ Published Message. Status: ${publishData.status}`);

  // 3. Fetch Public Messages (Mobile View)
  console.log('\n[3] Fetching Public Messages (Mobile View)...');
  const fetchRes = await fetch(`${BASE_URL}/messages`);
  const messages = await fetchRes.json() as any[];
  
  if (!fetchRes.ok) throw new Error(JSON.stringify(messages));

  const found = messages.find((m: any) => m.id === messageId);

  if (found) {
    console.log(`✓ SUCCESS: Message ${messageId} found in public feed.`);
    console.log(`  Title: ${found.title}`);
    console.log(`  Body: ${found.body}`);
  } else {
    console.error('❌ FAILURE: Message not found in public feed.');
    console.log('Response:', JSON.stringify(messages, null, 2));
  }
}

run().catch(err => {
  console.error('❌ Error during verification:', err.message);
});
