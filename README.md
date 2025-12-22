# AssetVerse Server

AssetVerse is a comprehensive Asset Management System designed to help companies track, manage, and assign assets to their employees efficiently.

**Live Link:** [https://assetverse-server-byuf.onrender.com](https://assetverse-server-byuf.onrender.com)

---

## 🚀 Technologies Used

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB
- **Authentication**: Firebase Admin SDK (JWT)
- **Payments**: Stripe
- **Environment Management**: Dotenv
- **Cross-Origin Resource Sharing**: CORS

---

## 🛠️ Workflow

### 1. User Roles & Registration
- **HR Manager**: Registers the company, manages assets, and handles employee requests.
- **Employee**: Registers and can request assets from their affiliated company.

### 2. Authentication & Security
- All private routes are protected using a `verifyJWT` middleware that validates Firebase ID Tokens.
- RBAC (Role-Based Access Control) ensures HR managers can only manage their own company's assets and employees.

### 3. Asset Management
- HR can add, edit, and delete assets (Returnable vs. Non-returnable).
- System tracks asset quantity and availability in real-time.

### 4. Direct Assignment & Requests
- **Requests**: Employees browse assets and submit requests with notes.
- **Assignments**: HR can approve requests, which automatically deducts stock and creates an assignment record. HR can also directly assign assets to employees.

### 5. Team & Affiliation
- Upon request approval, employees are automatically affiliated with the HR's company.
- HR can view and manage their team members, while employees can see their teammates.

### 6. Package & Subscription
- HR starts with a limited employee capacity.
- **Stripe Integration**: HR can upgrade their package (Basic, Standard, Premium) to increase their employee limit via a secure payment gateway.

### 7. Analytics Dashboard
- Data-driven insights for HR, including:
  - Asset type distribution.
  - Top 5 most requested assets.
  - Overall stats (Pending requests, total assets, assigned assets).

---

## 📡 Methods Used (API Endpoints)

### Auth & User
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/users/hr` | Register a new HR Manager |
| `POST` | `/users/employee` | Register a new Employee |
| `GET` | `/users/:email` | Get user profile and role by email |

### Assets
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/assets` | Get all assets (with pagination) |
| `GET` | `/assets/:id` | Get details of a single asset |
| `POST` | `/assets` | Add a new asset (HR Only) |

### Requests & Assignments
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/requests` | Submit an asset request (Employee) |
| `GET` | `/requests/hr` | Get all requests for HR's company |
| `PATCH` | `/requests/:id/action` | Approve or Reject a request (HR) |
| `POST` | `/assign-asset` | Directly assign asset to employee (HR) |
| `GET` | `/assigned-assets/employee/:email` | View assets assigned to an employee |

### Team & HR Management
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/employees/hr` | Get list of all affiliated employees |
| `GET` | `/my-team` | Get team members and birthdays |

### Payments & Subscription
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/create-payment-intent` | Initialize Stripe payment |
| `POST` | `/upgrade-package` | Update HR package after payment |
| `GET` | `/payments` | Get payment history |
| `GET` | `/current-package` | Check current subscription status |

### Analytics
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/analytics/overview` | Overall company statistics |
| `GET` | `/analytics/asset-distribution` | Returnable vs Non-returnable chart data |
| `GET` | `/analytics/top-requested-assets` | Top 5 requested assets |

---

## 💻 Local Setup

1. Clone the repository:
   ```bash
   git clone <repository-url>
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file and add the following:
   ```env
   PORT=5000
   MONGO_USER=your_mongo_user
   MONGO_PASS=your_mongo_password
   STRIPE_SECRET_KEY=your_stripe_secret
   FB_SERVICE_KEY=your_firebase_service_key_base64
   ```
4. Start the server:
   ```bash
   npm run dev
   ```
