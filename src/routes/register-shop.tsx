import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Package,
  Loader2,
  Store,
  User,
  FileText,
  Upload,
  Lock,
  CheckCircle,
  ArrowLeft,
  X,
} from "lucide-react";

export const Route = createFileRoute("/register-shop")({
  head: () => ({
    meta: [
      { title: "Create Your Shop — ShopFlow" },
      { name: "description", content: "Register your shop on ShopFlow to get started." },
    ],
  }),
  component: RegisterShopPage,
});

type SelectedPlan = {
  id: string;
  name: string;
  plan_type: "TRIAL" | "SIX_MONTH" | "ONE_YEAR";
  duration_days: number;
  price: number;
};

type DocFile = { file: File; preview: string; type: string };

const SHOP_TYPES = [
  "Stationery",
  "General Store",
  "Hardware",
  "Mobile Shop",
  "Electronics",
  "Gift Shop",
  "Toy Shop",
  "Pharmacy",
  "Grocery",
  "Other",
];

const STATES = [
  "Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh","Goa",
  "Gujarat","Haryana","Himachal Pradesh","Jharkhand","Karnataka","Kerala",
  "Madhya Pradesh","Maharashtra","Manipur","Meghalaya","Mizoram","Nagaland",
  "Odisha","Punjab","Rajasthan","Sikkim","Tamil Nadu","Telangana","Tripura",
  "Uttar Pradesh","Uttarakhand","West Bengal","Delhi","Jammu & Kashmir","Ladakh",
];

export function RegisterShopPage() {
  const navigate = useNavigate();
  const [selectedPlan, setSelectedPlan] = useState<SelectedPlan | null>(null);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Shop details
  const [shopName, setShopName] = useState("");
  const [shopType, setShopType] = useState("General Store");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [pincode, setPincode] = useState("");

  // Contact
  const [ownerName, setOwnerName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");

  // Verification
  const [panNumber, setPanNumber] = useState("");
  const [gstNumber, setGstNumber] = useState("");

  // Documents
  const [panCard, setPanCard] = useState<DocFile | null>(null);
  const [shopLicense, setShopLicense] = useState<DocFile | null>(null);
  const [addressProof, setAddressProof] = useState<DocFile | null>(null);
  const panRef = useRef<HTMLInputElement>(null);
  const licenseRef = useRef<HTMLInputElement>(null);
  const addressRef = useRef<HTMLInputElement>(null);

  // Account
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    const planStr = sessionStorage.getItem("selectedPlan");
    if (!planStr) {
      toast.error("Please select a plan first");
      navigate({ to: "/subscriptions" });
      return;
    }
    try {
      setSelectedPlan(JSON.parse(planStr));
    } catch {
      navigate({ to: "/subscriptions" });
    }
  }, [navigate]);

  function pickFile(
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (f: DocFile | null) => void
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File must be under 10 MB");
      return;
    }
    const allowed = ["image/jpeg", "image/png", "application/pdf"];
    if (!allowed.includes(file.type)) {
      toast.error("Only JPG, PNG or PDF allowed");
      return;
    }
    setter({ file, preview: URL.createObjectURL(file), type: file.type });
  }

  async function uploadFile(file: File, path: string): Promise<string | null> {
    const { error } = await supabase.storage.from("shop-documents").upload(path, file, {
      contentType: file.type,
      upsert: true,
    });
    if (error) {
      toast.error(`Upload failed: ${error.message}`);
      return null;
    }
    const { data } = supabase.storage.from("shop-documents").getPublicUrl(path);
    return data.publicUrl;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      return toast.error("Passwords do not match");
    }
    if (password.length < 8) {
      return toast.error("Password must be at least 8 characters");
    }
    if (!panCard) {
      return toast.error("PAN card image is required");
    }

    setLoading(true);

    try {
      // 1. Create auth user
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: ownerName, shop_name: shopName },
        },
      });
      if (signUpError || !signUpData.user) {
        toast.error(signUpError?.message ?? "Registration failed");
        setLoading(false);
        return;
      }
      const userId = signUpData.user.id;

      // 2. Create shop record
      const { data: shop, error: shopError } = await supabase
        .from("shops")
        .insert({
          user_id: userId,
          name: shopName,
          type: shopType,
          address,
          city,
          state,
          pincode,
          owner_name: ownerName,
          mobile,
          email,
          pan_number: panNumber.toUpperCase(),
          gst_number: gstNumber.toUpperCase() || null,
        })
        .select()
        .single();

      if (shopError || !shop) {
        toast.error(shopError?.message ?? "Shop creation failed");
        setLoading(false);
        return;
      }

      // 3. Update profile
      await supabase.from("profiles").update({
        full_name: ownerName,
        shop_name: shopName,
        shop_category: shopType,
        address,
        city,
        state,
        pincode,
        trial_used: selectedPlan?.plan_type === "TRIAL",
      }).eq("id", userId);

      // 4. Create subscription
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + (selectedPlan?.duration_days ?? 30));

      const razorpayResponse = sessionStorage.getItem("razorpayResponse");
      const isTrialOrPaid = selectedPlan?.plan_type === "TRIAL" || !!razorpayResponse;

      const { data: sub } = await supabase
        .from("subscriptions")
        .insert({
          user_id: userId,
          shop_id: shop.id,
          plan: selectedPlan?.plan_type === "TRIAL" ? "half_yearly" : selectedPlan?.plan_type === "SIX_MONTH" ? "half_yearly" : "yearly",
          plan_type: selectedPlan?.plan_type,
          price: selectedPlan?.price ?? 0,
          status: isTrialOrPaid ? "active" : "pending",
          start_date: startDate.toISOString(),
          end_date: endDate.toISOString(),
          expires_at: endDate.toISOString(),
          trial_used: selectedPlan?.plan_type === "TRIAL",
        })
        .select()
        .single();

      // 5. Record payment if paid plan
      if (razorpayResponse && sub) {
        const rp = JSON.parse(razorpayResponse);
        await supabase.from("subscription_payments").insert({
          shop_id: shop.id,
          subscription_id: sub.id,
          razorpay_order_id: rp.razorpay_order_id,
          razorpay_payment_id: rp.razorpay_payment_id,
          amount: selectedPlan?.price ?? 0,
          payment_status: "captured",
        });
      }

      // 6. Upload documents
      if (panCard) {
        const ext = panCard.file.name.split(".").pop();
        const url = await uploadFile(panCard.file, `${userId}/pan_card.${ext}`);
        if (url) {
          await supabase.from("shop_documents").insert({
            shop_id: shop.id,
            document_type: "pan_card",
            file_url: url,
          });
        }
      }
      if (shopLicense) {
        const ext = shopLicense.file.name.split(".").pop();
        const url = await uploadFile(shopLicense.file, `${userId}/shop_license.${ext}`);
        if (url) {
          await supabase.from("shop_documents").insert({
            shop_id: shop.id,
            document_type: "shop_license",
            file_url: url,
          });
        }
      }
      if (addressProof) {
        const ext = addressProof.file.name.split(".").pop();
        const url = await uploadFile(addressProof.file, `${userId}/address_proof.${ext}`);
        if (url) {
          await supabase.from("shop_documents").insert({
            shop_id: shop.id,
            document_type: "address_proof",
            file_url: url,
          });
        }
      }

      // Cleanup
      sessionStorage.removeItem("selectedPlan");
      sessionStorage.removeItem("razorpayResponse");

      toast.success("Shop registered successfully! Welcome to ShopFlow 🎉");
      navigate({ to: "/dashboard" });
    } catch (err: any) {
      toast.error(err?.message ?? "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  const steps = [
    { n: 1, label: "Shop Details", icon: Store },
    { n: 2, label: "Contact", icon: User },
    { n: 3, label: "Verification", icon: FileText },
    { n: 4, label: "Documents", icon: Upload },
    { n: 5, label: "Account", icon: Lock },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-background/80 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto max-w-3xl px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-bold text-lg">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-primary-foreground"
              style={{ background: "var(--gradient-primary)" }}
            >
              <Package className="w-4 h-4" />
            </div>
            ShopFlow
          </Link>
          {selectedPlan && (
            <Badge variant="secondary" className="text-xs font-medium">
              {selectedPlan.name} Plan
            </Badge>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-10">
        {/* Progress Steps */}
        <div className="flex items-center justify-between mb-10 relative">
          <div className="absolute top-5 left-0 right-0 h-0.5 bg-border -z-0" />
          <div
            className="absolute top-5 left-0 h-0.5 bg-primary -z-0 transition-all duration-500"
            style={{ width: `${((step - 1) / (steps.length - 1)) * 100}%` }}
          />
          {steps.map((s) => {
            const Icon = s.icon;
            const done = step > s.n;
            const active = step === s.n;
            return (
              <div key={s.n} className="flex flex-col items-center gap-2 z-10">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-200 ${
                    done
                      ? "bg-primary border-primary text-primary-foreground"
                      : active
                      ? "bg-background border-primary text-primary"
                      : "bg-background border-border text-muted-foreground"
                  }`}
                >
                  {done ? <CheckCircle className="w-5 h-5" /> : <Icon className="w-4 h-4" />}
                </div>
                <span
                  className={`text-xs hidden md:block ${
                    active ? "text-primary font-medium" : "text-muted-foreground"
                  }`}
                >
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>

        <form onSubmit={handleSubmit}>
          <Card className="p-6 md:p-8" style={{ boxShadow: "var(--shadow-elegant)" }}>
            {/* Step 1: Shop Details */}
            {step === 1 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-bold flex items-center gap-2">
                    <Store className="w-5 h-5 text-primary" /> Shop Details
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Tell us about your shop
                  </p>
                </div>
                <Field label="Shop Name *" value={shopName} onChange={setShopName} placeholder="e.g. Ramesh Stationery" required />
                <div className="space-y-1.5">
                  <Label>Shop Type *</Label>
                  <select
                    value={shopType}
                    onChange={(e) => setShopType(e.target.value)}
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                    required
                  >
                    {SHOP_TYPES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <Field label="Shop Address *" value={address} onChange={setAddress} placeholder="Street / Area" required />
                <div className="grid grid-cols-2 gap-4">
                  <Field label="City *" value={city} onChange={setCity} placeholder="e.g. Pune" required />
                  <div className="space-y-1.5">
                    <Label>State *</Label>
                    <select
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                      className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                      required
                    >
                      <option value="">— Select State —</option>
                      {STATES.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                <Field label="Pincode *" value={pincode} onChange={setPincode} placeholder="e.g. 411001" type="text" inputMode="numeric" maxLength={6} required />
              </div>
            )}

            {/* Step 2: Contact */}
            {step === 2 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-bold flex items-center gap-2">
                    <User className="w-5 h-5 text-primary" /> Contact Details
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Your personal contact information
                  </p>
                </div>
                <Field label="Owner Name *" value={ownerName} onChange={setOwnerName} placeholder="Full name" required />
                <Field label="Mobile Number *" value={mobile} onChange={setMobile} type="tel" placeholder="+91 98765 43210" required />
                <Field label="Email Address *" value={email} onChange={setEmail} type="email" placeholder="you@example.com" required />
              </div>
            )}

            {/* Step 3: Verification */}
            {step === 3 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-bold flex items-center gap-2">
                    <FileText className="w-5 h-5 text-primary" /> Verification Details
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Required for account verification
                  </p>
                </div>
                <Field
                  label="PAN Card Number *"
                  value={panNumber}
                  onChange={(v) => setPanNumber(v.toUpperCase())}
                  placeholder="ABCDE1234F"
                  maxLength={10}
                  required
                />
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Label>GST Number</Label>
                    <Badge variant="outline" className="text-xs">Optional</Badge>
                  </div>
                  <Input
                    value={gstNumber}
                    onChange={(e) => setGstNumber(e.target.value.toUpperCase())}
                    placeholder="22AAAAA0000A1Z5"
                    maxLength={15}
                  />
                  <p className="text-xs text-muted-foreground">Leave blank if not registered for GST</p>
                </div>
              </div>
            )}

            {/* Step 4: Documents */}
            {step === 4 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-bold flex items-center gap-2">
                    <Upload className="w-5 h-5 text-primary" /> Document Uploads
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    JPG, PNG or PDF — max 10 MB each
                  </p>
                </div>

                <DocUpload
                  label="PAN Card Image *"
                  required
                  doc={panCard}
                  inputRef={panRef}
                  onPick={(e) => pickFile(e, setPanCard)}
                  onRemove={() => setPanCard(null)}
                />
                <DocUpload
                  label="Shop License"
                  optional
                  doc={shopLicense}
                  inputRef={licenseRef}
                  onPick={(e) => pickFile(e, setShopLicense)}
                  onRemove={() => setShopLicense(null)}
                />
                <DocUpload
                  label="Address Proof"
                  optional
                  doc={addressProof}
                  inputRef={addressRef}
                  onPick={(e) => pickFile(e, setAddressProof)}
                  onRemove={() => setAddressProof(null)}
                />
              </div>
            )}

            {/* Step 5: Account */}
            {step === 5 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-bold flex items-center gap-2">
                    <Lock className="w-5 h-5 text-primary" /> Account Setup
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Create your login credentials
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50 text-sm">
                  <span className="font-medium">Login email: </span>
                  <span className="text-muted-foreground">{email}</span>
                </div>
                <Field label="Password *" value={password} onChange={setPassword} type="password" placeholder="Min. 8 characters" required />
                <Field label="Confirm Password *" value={confirmPassword} onChange={setConfirmPassword} type="password" placeholder="Re-enter password" required />
                {password && confirmPassword && password !== confirmPassword && (
                  <p className="text-sm text-destructive">Passwords do not match</p>
                )}
                <div className="pt-2 p-4 rounded-lg border border-border bg-card space-y-1.5 text-sm">
                  <div className="font-medium text-muted-foreground mb-2">Registration Summary</div>
                  <SummaryRow k="Shop" v={shopName} />
                  <SummaryRow k="Type" v={shopType} />
                  <SummaryRow k="Plan" v={selectedPlan?.name ?? "—"} />
                  <SummaryRow k="Owner" v={ownerName} />
                  <SummaryRow k="PAN" v={panNumber} />
                </div>
              </div>
            )}
          </Card>

          {/* Navigation */}
          <div className="flex items-center justify-between mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => step > 1 ? setStep(step - 1) : navigate({ to: "/subscriptions" })}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              {step === 1 ? "Back to Plans" : "Back"}
            </Button>

            {step < 5 ? (
              <Button
                type="button"
                onClick={() => {
                  // Basic validation per step
                  if (step === 1 && (!shopName || !address || !city || !state || !pincode)) {
                    return toast.error("Please fill all required shop details");
                  }
                  if (step === 2 && (!ownerName || !mobile || !email)) {
                    return toast.error("Please fill all contact details");
                  }
                  if (step === 3 && !panNumber) {
                    return toast.error("PAN number is required");
                  }
                  if (step === 4 && !panCard) {
                    return toast.error("PAN card image is required");
                  }
                  setStep(step + 1);
                }}
              >
                Continue <ArrowLeft className="w-4 h-4 ml-2 rotate-180" />
              </Button>
            ) : (
              <Button type="submit" disabled={loading} className="px-8">
                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {loading ? "Creating Shop…" : "Create Shop & Start"}
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, type = "text", placeholder, required, maxLength, inputMode,
}: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; required?: boolean; maxLength?: number;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        maxLength={maxLength}
        inputMode={inputMode}
      />
    </div>
  );
}

function DocUpload({
  label, required, optional, doc, inputRef, onPick, onRemove,
}: {
  label: string; required?: boolean; optional?: boolean;
  doc: DocFile | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onPick: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Label>{label}</Label>
        {optional && <Badge variant="outline" className="text-xs">Optional</Badge>}
      </div>
      {doc ? (
        <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-accent/30">
          <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center">
            <FileText className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{doc.file.name}</div>
            <div className="text-xs text-muted-foreground">
              {(doc.file.size / 1024).toFixed(0)} KB
            </div>
          </div>
          <button
            type="button"
            onClick={onRemove}
            className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full border-2 border-dashed border-border rounded-xl p-6 text-center hover:border-primary/50 hover:bg-accent/30 transition-colors"
        >
          <Upload className="w-6 h-6 mx-auto mb-2 text-muted-foreground" />
          <div className="text-sm text-muted-foreground">
            Click to upload · JPG, PNG or PDF · Max 10 MB
          </div>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.pdf"
        className="hidden"
        onChange={onPick}
        required={required && !doc}
      />
    </div>
  );
}

function SummaryRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-medium">{v || "—"}</span>
    </div>
  );
}
