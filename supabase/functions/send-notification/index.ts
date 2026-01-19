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

// Simple function to send notification via NotificationAPI
async function sendNotificationAPI(
  clientId: string,
  clientSecret: string,
  options: {
    userId: string;
    email: string;
    phone?: string;
    title: string;
    message: string;
  }
) {
  const authHeader = btoa(`${clientId}:${clientSecret}`);
  
  const payload = {
    notificationId: 'hr_management',
    user: {
      id: options.userId,
      email: options.email,
      number: options.phone || undefined
    },
    mergeTags: {
      title: options.title,
      message: options.message
    }
  };

  console.log('Sending notification with payload:', JSON.stringify(payload));

  const response = await fetch('https://api.notificationapi.com/sender/send', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${authHeader}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('NotificationAPI error:', errorText);
    throw new Error(`NotificationAPI failed: ${errorText}`);
  }

  return await response.json();
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
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      console.error('Invalid JWT token:', authError);
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Authenticated user:', user.id);

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

    console.log('Sending notification to:', body.userEmail);

    // Send notification using the simple function
    const result = await sendNotificationAPI(clientId, clientSecret, {
      userId: body.userId,
      email: body.userEmail,
      phone: body.userPhone,
      title: body.title,
      message: body.message
    });

    console.log('Notification sent successfully:', result);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Notification sent via hr_management template',
        result
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
