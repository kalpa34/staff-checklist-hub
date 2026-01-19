import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NotificationRequest {
  userId: string;
  userEmail: string;
  userPhone?: string;
  title: string;
  message: string;
  sendSms?: boolean;
  sendCall?: boolean;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const clientId = Deno.env.get('NOTIFICATION_API_CLIENT_ID');
    const clientSecret = Deno.env.get('NOTIFICATION_API_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      console.error('Missing NotificationAPI credentials');
      throw new Error('NotificationAPI credentials not configured');
    }

    const body: NotificationRequest = await req.json();
    console.log('Sending notification:', { userId: body.userId, title: body.title });

    const notifications = [];

    // Send email notification (default)
    const emailPayload = {
      notificationId: 'checklist_complete',
      user: {
        id: body.userId,
        email: body.userEmail,
        number: body.userPhone || undefined
      },
      mergeTags: {
        title: body.title,
        message: body.message
      }
    };

    // Send via NotificationAPI
    const authHeader = btoa(`${clientId}:${clientSecret}`);
    
    const response = await fetch('https://api.notificationapi.com/sender/send', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authHeader}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(emailPayload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('NotificationAPI error:', errorText);
      throw new Error(`NotificationAPI error: ${response.status}`);
    }

    const result = await response.json();
    console.log('Notification sent successfully:', result);

    // If SMS requested and phone available
    if (body.sendSms && body.userPhone) {
      console.log('SMS notification requested for:', body.userPhone);
      const smsPayload = {
        notificationId: 'checklist_complete_sms',
        user: {
          id: body.userId,
          number: body.userPhone
        },
        mergeTags: {
          title: body.title,
          message: body.message
        }
      };

      const smsResponse = await fetch('https://api.notificationapi.com/sender/send', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${authHeader}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(smsPayload)
      });

      if (smsResponse.ok) {
        notifications.push('sms');
      }
    }

    // If call requested and phone available
    if (body.sendCall && body.userPhone) {
      console.log('Call notification requested for:', body.userPhone);
      const callPayload = {
        notificationId: 'checklist_complete_call',
        user: {
          id: body.userId,
          number: body.userPhone
        },
        mergeTags: {
          title: body.title,
          message: body.message
        }
      };

      const callResponse = await fetch('https://api.notificationapi.com/sender/send', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${authHeader}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(callPayload)
      });

      if (callResponse.ok) {
        notifications.push('call');
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Notifications sent',
        channels: ['email', ...notifications]
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error sending notification:', errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
