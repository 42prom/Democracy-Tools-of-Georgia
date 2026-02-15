
const BASE_URL = 'http://localhost:3000/api/v1';

async function testRealTimeDelivery() {
  console.log('--- Starting Real-time Message Delivery Test ---');

  // 1. Start "Client" Polling Simulator
  console.log('[Client] Starting polling simulator...');
  let messageReceived = false;
  const pollInterval = setInterval(async () => {
    try {
      const res = await fetch(`${BASE_URL}/messages`);
      if (!res.ok) throw new Error(res.statusText);
      const messages: any = await res.json();
      const targetMessage = messages.find((m: any) => m.title === 'Real-time Test Message');
      
      if (targetMessage) {
        console.log(`\n[Client] ✓ Message Received: "${targetMessage.title}"`);
        messageReceived = true;
        clearInterval(pollInterval);
      } else {
        process.stdout.write('.');
      }
    } catch (e) {
      process.stdout.write('x');
    }
  }, 1000); // Poll every 1s

  // 2. Publish Message after a delay
  setTimeout(async () => {
    try {
      console.log('\n[Admin] Creating Message...');
      const createRes = await fetch(`${BASE_URL}/admin/messages`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test' 
        },
        body: JSON.stringify({
          title: 'Real-time Test Message',
          body: 'This should appear immediately.',
          type: 'announcement',
          audience_rules: {},
          publish_at: null,
          expire_at: null
        })
      });

      if (!createRes.ok) throw new Error(await createRes.text());
      const msgData: any = await createRes.json();
      const msgId = msgData.id;
      console.log(`[Admin] Created Draft ID: ${msgId}`);

      console.log('[Admin] Publishing...');
      const pubRes = await fetch(`${BASE_URL}/admin/messages/${msgId}/publish`, {
        method: 'POST',
        headers: { 'Authorization': 'Bearer test' }
      });
      if (!pubRes.ok) throw new Error(await pubRes.text());
      console.log('[Admin] Published!');

      // Start timeout for failure
      setTimeout(() => {
        if (!messageReceived) {
          console.error('\n❌ Timeout: Message not received by client within 10s.');
          clearInterval(pollInterval);
          process.exit(1);
        } else {
          console.log('\n✓ Test Passed: Real-time delivery confirmed.');
          process.exit(0);
        }
      }, 10000);

    } catch (error: any) {
      console.error('❌ Admin Action Failed:', error.message);
      clearInterval(pollInterval);
      process.exit(1);
    }
  }, 3000);
}

testRealTimeDelivery();
