// Supabase Edge Function: ocr-invoice
// Processes a distributor invoice image/PDF using Google Vision API
// Deploy: supabase functions deploy ocr-invoice
// Env vars required: GOOGLE_VISION_API_KEY

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface LineItem {
  product_name: string;
  quantity: number;
  purchase_price: number;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { invoiceId, fileUrl } = await req.json();

    const GOOGLE_VISION_API_KEY = Deno.env.get("GOOGLE_VISION_API_KEY");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Mark as processing
    await supabase.from("purchase_invoices").update({ ocr_status: "processing" }).eq("id", invoiceId);

    if (!GOOGLE_VISION_API_KEY) {
      // Return mock data if API key not configured (for development)
      const mockItems: LineItem[] = [
        { product_name: "Classmate Notebook 200 Pages", quantity: 10, purchase_price: 45 },
        { product_name: "Reynolds Pen Blue", quantity: 50, purchase_price: 8 },
        { product_name: "Stapler Heavy Duty", quantity: 5, purchase_price: 120 },
      ];

      for (const item of mockItems) {
        await supabase.from("purchase_invoice_items").insert({
          invoice_id: invoiceId,
          product_name: item.product_name,
          quantity: item.quantity,
          purchase_price: item.purchase_price,
          match_confidence: 0.7,
        });
      }

      await supabase.from("purchase_invoices").update({ ocr_status: "completed" }).eq("id", invoiceId);
      return new Response(JSON.stringify({ success: true, items: mockItems, mock: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch the file
    const fileResponse = await fetch(fileUrl);
    const fileBuffer = await fileResponse.arrayBuffer();
    const base64Content = btoa(String.fromCharCode(...new Uint8Array(fileBuffer)));

    const mimeType = fileUrl.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg";

    // Call Google Vision API
    const visionResponse = await fetch(
      `https://vision.googleapis.com/v1/files:annotate?key=${GOOGLE_VISION_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: [{
            inputConfig: { content: base64Content, mimeType },
            features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
            pages: [1, 2, 3],
          }],
        }),
      }
    );

    const visionData = await visionResponse.json();
    const fullText = visionData.responses?.[0]?.responses?.[0]?.fullTextAnnotation?.text ?? "";

    // Parse line items from OCR text
    const items = parseInvoiceItems(fullText);

    // Save items to DB
    for (const item of items) {
      await supabase.from("purchase_invoice_items").insert({
        invoice_id: invoiceId,
        product_name: item.product_name,
        quantity: item.quantity,
        purchase_price: item.purchase_price,
        match_confidence: item.confidence,
      });
    }

    await supabase.from("purchase_invoices").update({ ocr_status: "completed" }).eq("id", invoiceId);

    return new Response(JSON.stringify({ success: true, items, itemCount: items.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("OCR error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

/**
 * Parse invoice line items from raw OCR text.
 * Looks for patterns like: ITEM NAME   QTY   PRICE
 */
function parseInvoiceItems(text: string): Array<LineItem & { confidence: number }> {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const items: Array<LineItem & { confidence: number }> = [];

  // Regex to detect lines with product + quantity + price
  const linePattern = /^(.+?)\s+(\d+)\s+[xX]?\s*[\u20B9Rs.]?\s*(\d+(?:\.\d{1,2})?)$/;
  const altPattern = /^(.+?)\s+(\d+(?:\.\d{1,2})?)\s+(\d+(?:\.\d{1,2})?)$/;

  for (const line of lines) {
    let match = line.match(linePattern) || line.match(altPattern);
    if (match) {
      const [, name, qty, price] = match;
      const qtyNum = parseInt(qty);
      const priceNum = parseFloat(price);
      if (name.length > 2 && qtyNum > 0 && priceNum > 0 && priceNum < 100000) {
        items.push({
          product_name: name.trim(),
          quantity: qtyNum,
          purchase_price: priceNum,
          confidence: 0.85,
        });
      }
    }
  }

  return items;
}
