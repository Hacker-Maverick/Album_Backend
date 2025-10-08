import mongoose, { SchemaType } from "mongoose";

const planSchema = new mongoose.Schema({
  totalSpace: { type: Number, default: 2 * 1024 * 1024 * 1024 }, // 2GB default in bytes
  spaceUsed: { type: Number, default: 0 },
  valid_from: { type: Date, default: Date.now },
  valid_till: { type: Date },
  plan: { type: String, default: "free" },
  paymentId: { type: mongoose.Schema.Types.ObjectId, ref: "Payment" }
});

const groupSchema = new mongoose.Schema({
  groupName: { type: String },
  albumId: { type: mongoose.Schema.Types.ObjectId, ref: "Album" }
});

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true , unique: true},
    email: { type: String, unique: true, sparse: true },
    phone: { type: String, unique: true, sparse: true },
    password: { type: String }, // Only for manual signup
    phoneVerified: { type: Boolean, default: false },
    emailVerified: { type: Boolean, default: false },
    requests:[{from:{type: mongoose.Schema.Types.ObjectId, ref: "User"}, date: {type: Date, default: Date.now}, images:[{type:mongoose.Schema.Types.ObjectId,ref:"Image"}],_id:false}], // image requests
    friends:[{ref_id: {type:mongoose.Schema.Types.ObjectId, ref: "User"},username:{type:String},nickname:{type:String}}], // friends list

    // 🔐 This field tells us how the user signed up
    authProvider: {
      type: String,
      enum: ["manual", "google"],
      default: "manual"
    },

    plan: { type: planSchema, default: () => ({}) },
    main_album: { type: mongoose.Schema.Types.ObjectId, ref: "Album" },
    groups: [groupSchema]
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);
