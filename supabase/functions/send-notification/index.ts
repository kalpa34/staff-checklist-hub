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
  employeeName?: string;
  departmentName?: string;
  checklistTitle?: string;
  notificationType: 'checklist_assigned' | 'checklist_completed';
}

// Send notification via NotificationAPI
async function sendNotificationAPI(
  clientId: string,
  clientSecret: string,
  options: {
    userId: string;
    email: string;
    phone?: string;
    employeeName?: string;
    departmentName?: string;
    checklistTitle?: string;
    notificationType: 'checklist_assigned' | 'checklist_completed';
  }
) {
  const authHeader = btoa(`${clientId}:${clientSecret}`);
  
  // Build merge tags based on notification type
  let title: string;
  let message: string;

  if (options.notificationType === 'checklist_assigned') {
    // SMS for employee when checklist is assigned
    title = options.departmentName || 'Department';
    message = `${options.employeeName || 'Employee'}, the admin has given you a checklist "${options.checklistTitle || 'New Checklist'}". Start doing it.`;
  } else {
    // SMS for admin when employee completes checklist
    title = 'Checklist Completed';
    message = `${options.employeeName || 'Employee'} in "${options.departmentName || 'Department'}" has completed the checklist assigned to them.`;
  }

  const payload = {
    notificationId: 'notificantios',
    user: {
      id: options.userId,
      email: options.email,
      number: options.phone || undefined
    },
    mergeTags: {
      title: title,
      message: message,
      employeeName: options.employeeName || '',
      departmentName: options.departmentName || '',
      checklistTitle: options.checklistTitle || ''
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
    if (!body.userId || !body.userEmail || !body.notificationType) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields: userId, userEmail, notificationType' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Skip if no phone number for SMS
    if (!body.userPhone) {
      console.log('No phone number provided, skipping SMS notification');
      return new Response(
        JSON.stringify({ success: true, message: 'Skipped - no phone number' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Sending ${body.notificationType} notification to:`, body.userEmail);

    // Send notification using NotificationAPI
    const result = await sendNotificationAPI(clientId, clientSecret, {
      userId: body.userId,
      email: body.userEmail,
      phone: body.userPhone,
      employeeName: body.employeeName,
      departmentName: body.departmentName,
      checklistTitle: body.checklistTitle,
      notificationType: body.notificationType
    });

    console.log('Notification sent successfully:', result);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `${body.notificationType} notification sent`,
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
