import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Verify the JWT token is valid
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      console.error('Invalid JWT token:', claimsError);
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const authenticatedUserId = claimsData.claims.sub;
    console.log('Authenticated user:', authenticatedUserId);

    const clientId = Deno.env.get('NOTIFICATION_API_CLIENT_ID');
    const clientSecret = Deno.env.get('NOTIFICATION_API_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      console.error('Missing NotificationAPI credentials');
      return new Response(
        JSON.stringify({ success: false, error: 'Notification service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: NotificationRequest = await req.json();
    
    // Validate required fields
    if (!body.userId || !body.userEmail || !body.title || !body.message) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate input lengths
    if (body.title.length > 200 || body.message.length > 2000) {
      return new Response(
        JSON.stringify({ success: false, error: 'Title or message too long' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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
    const authHeaderApi = btoa(`${clientId}:${clientSecret}`);
    
    const response = await fetch('https://api.notificationapi.com/sender/send', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authHeaderApi}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(emailPayload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('NotificationAPI error:', errorText);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to send notification' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
          'Authorization': `Basic ${authHeaderApi}`,
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
          'Authorization': `Basic ${authHeaderApi}`,
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
    console.error('Error sending notification:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'An unexpected error occurred' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
