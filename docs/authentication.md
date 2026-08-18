# Requirement: Integrate Simple AI OS with IAM Single Sign-On Service

## 1. Overview

The **Simple AI OS** application must integrate with the centralized **IAM (Identity and Access Management) service** to provide Single Sign-On (SSO) authentication.

The IAM service will be responsible for authenticating users. Simple AI OS will act as an **SSO client/application** and will not implement its own authentication mechanism.

The IAM service URL must be configurable through an environment variable.

---

## 2. Configuration

The IAM service URL must be configured using an environment variable:

```env
IAM_URL=https://iam.example.com
```

The application must not hard-code the IAM URL.

The Simple AI OS application must also be registered in the IAM service using an application identifier:

```text
app=simple-ai-os
```

The IAM configuration for the application must define the following callback URLs:

* **success-url** — URL to which the user is redirected after successful authentication.
* **error-url** — URL to which the user is redirected when authentication fails.
* **authenticated-url** — endpoint in Simple AI OS that receives the authentication result from IAM.

Example configuration:

```text
Application: simple-ai-os

success-url:
https://simple-ai-os.example.com/dashboard

error-url:
https://simple-ai-os.example.com/auth/error

authenticated-url:
https://simple-ai-os.example.com/api/auth/authenticated
```

---

# 3. Authentication Flow

## 3.1 User opens Simple AI OS

When a user accesses the main Simple AI OS URL:

```text
https://simple-ai-os.example.com/
```

the application must determine whether the user already has a valid authenticated session.

### If the user is authenticated

The user must be redirected directly to the main user dashboard:

```text
/dashboard
```

The application must not redirect an already authenticated user to IAM.

### If the user is not authenticated

The application must redirect the user to the IAM authentication endpoint.

The request must include the application identifier as the `app` parameter.

Example:

```text
${IAM_URL}/auth?app=simple-ai-os
```

The exact IAM authentication path should be configurable if necessary.

---

# 4. IAM Application Configuration

When IAM receives the authentication request, it must use the `app` parameter to identify the Simple AI OS application configuration.

The configuration contains:

```text
success-url
error-url
authenticated-url
```

IAM must use these URLs to determine how to complete the authentication flow.

Simple AI OS must not need to know or hard-code these callback URLs independently if they are managed by IAM.

---

# 5. Successful Authentication

When the user successfully authenticates with IAM:

1. IAM authenticates the user.
2. IAM generates or retrieves an authentication token.
3. IAM sends the authentication result to the Simple AI OS `authenticated-url`.
4. The authentication request must contain:

   * Authentication token
   * Authenticated user's email
5. IAM then redirects the user's browser to the configured `success-url`.

Example:

```text
POST https://simple-ai-os.example.com/api/auth/authenticated
```

Request payload:

```json
{
  "token": "<authentication-token>",
  "user_email": "user@example.com"
}
```

After the authentication result has been successfully processed, IAM redirects the browser to:

```text
https://simple-ai-os.example.com/dashboard
```

---

# 6. Authentication Result Handling

The Simple AI OS `authenticated-url` endpoint is responsible for processing the authentication result received from IAM.

Upon receiving a valid authentication response, Simple AI OS must:

1. Validate the authentication request.
2. Validate the token.
3. Identify the authenticated user.
4. Create or establish a local application session.
5. Associate the session with the authenticated user.
6. Store the minimum required authentication information.
7. Make the user available to the rest of the application as an authenticated user.

The application should preferably establish its own secure session rather than exposing the IAM token to frontend code.

The IAM token must never be logged.

---

# 7. Authentication Cancellation or Failure

If the user:

* Cancels authentication,
* Closes/cancels the authentication process,
* Provides invalid credentials,
* Fails authentication, or
* IAM otherwise determines that authentication cannot be completed,

IAM must redirect the user to the configured `error-url`.

Example:

```text
https://simple-ai-os.example.com/auth/error
```

Simple AI OS must display an appropriate authentication error to the user.

The error page should provide an option to retry authentication.

Example:

```text
Authentication could not be completed.

[Try Again]
```

---

# 8. Session Management

Once authentication has been completed successfully, Simple AI OS must maintain an authenticated session.

The application must support:

* Checking whether the current user is authenticated.
* Retrieving the current authenticated user.
* Maintaining the user's authenticated state across page navigation.
* Detecting expired or invalid sessions.
* Logging the user out.

If the local session expires or becomes invalid, the user must be redirected to the IAM authentication flow.

---

# 9. Logout

Simple AI OS must provide a logout mechanism.

When the user logs out:

1. The local Simple AI OS session must be invalidated.
2. Authentication credentials/session information must be removed.
3. If supported by IAM, the user should also be logged out of the IAM SSO session.
4. Subsequent access to Simple AI OS must require authentication again.

The IAM logout endpoint should be configurable rather than hard-coded.

---

# 10. Security Requirements

Because the authentication token is a security credential, the integration must follow these requirements:

### Token protection

* Never expose the IAM token in application logs.
* Never expose the token unnecessarily to frontend JavaScript.
* Never store the token in `localStorage` unless explicitly required by the IAM protocol.
* Prefer secure, HTTP-only cookies for the application session.
* Use `Secure` cookies in production.
* Use an appropriate `SameSite` policy.

### Request validation

The `authenticated-url` endpoint must not blindly trust arbitrary requests.

The application must validate that the authentication response originated from the IAM service.

Where supported by IAM, the integration should use one or more of:

* Signed authentication responses.
* JWT validation.
* Token introspection.
* Server-to-server token verification.
* State/nonce validation.
* HTTPS-only communication.

### Transport security

All authentication-related communication must use HTTPS in production.

---

# 11. Error Handling

The application must handle at least the following scenarios:

| Scenario                        | Expected behavior                                |
| ------------------------------- | ------------------------------------------------ |
| User is already authenticated   | Redirect to dashboard                            |
| User is not authenticated       | Redirect to IAM                                  |
| User successfully authenticates | Establish session and redirect to dashboard      |
| User cancels authentication     | Redirect to error page                           |
| Authentication fails            | Redirect to error page                           |
| IAM unavailable                 | Display authentication/service-unavailable error |
| Invalid authentication token    | Reject authentication and display error          |
| Expired authentication token    | Reject authentication and require login          |
| Missing `app` parameter         | IAM must reject the request                      |
| Unknown `app`                   | IAM must reject the request                      |
| Invalid callback configuration  | Authentication must fail safely                  |
| User session expires            | Redirect user to IAM                             |

---

# 12. High-Level Authentication Sequence

The expected successful flow is:

```text
User
 │
 │ GET /
 ▼
Simple AI OS
 │
 │ User authenticated?
 │
 ├── YES ───────────────► Dashboard
 │
 └── NO
      │
      │ Redirect
      ▼
     IAM
      │
      │ app=simple-ai-os
      │
      ▼
 Authentication
      │
      │ Successful
      ▼
 IAM
      │
      │ POST token + user_email
      ▼
Simple AI OS
 authenticated-url
      │
      │ Create local session
      ▼
Simple AI OS
      │
      │ Redirect
      ▼
   Dashboard
```

---

# 13. Failed Authentication Flow

```text
User
 │
 │ GET /
 ▼
Simple AI OS
 │
 │ Not authenticated
 ▼
 IAM
 │
 │ Authentication
 │
 ├── Cancelled ────────┐
 │                     │
 ├── Failed ───────────┤
 │                     ▼
 │              Simple AI OS
 │                 error-url
 │
 └── Success
```

---

# 14. Acceptance Criteria

### AC1 — Unauthenticated user

**Given** the user is not authenticated
**When** the user opens the Simple AI OS main page
**Then** the user is redirected to the IAM authentication URL
**And** the URL contains the `app=simple-ai-os` parameter.

### AC2 — Authenticated user

**Given** the user has a valid Simple AI OS session
**When** the user opens the main Simple AI OS page
**Then** the user is redirected to the main dashboard
**And** the user is not redirected to IAM.

### AC3 — Successful authentication

**Given** the user is not authenticated
**When** the user successfully authenticates through IAM
**Then** IAM sends the authentication result to the configured `authenticated-url`
**And** the result contains the authentication token and authenticated user's email
**And** Simple AI OS validates the authentication result
**And** Simple AI OS establishes an authenticated session
**And** the user is redirected to the configured `success-url`.

### AC4 — Authentication cancellation

**Given** the user is authenticating through IAM
**When** the user cancels authentication
**Then** IAM redirects the user to the configured `error-url`
**And** Simple AI OS displays an appropriate error message
**And** the user can retry authentication.

### AC5 — Invalid token

**Given** IAM sends an authentication token
**When** Simple AI OS determines that the token is invalid or expired
**Then** Simple AI OS must reject the authentication
**And** must not create an authenticated session
**And** the user must be required to authenticate again.

### AC6 — IAM configuration

**Given** the Simple AI OS application is deployed
**When** the application starts
**Then** the IAM URL must be loaded from the environment configuration
**And** no production IAM URL may be hard-coded in the application source code.

### AC7 — Token security

**Given** an authentication token is received
**When** Simple AI OS processes the token
**Then** the token must not be written to application logs
**And** the token must not be unnecessarily exposed to the browser
**And** the application session must use secure session-management practices.

---

# 15. Open Integration Questions

Before implementation, the IAM contract should explicitly define:

1. What is the exact authentication endpoint?
2. Is the authentication token a JWT or opaque token?
3. How does Simple AI OS validate the token?
4. Is there a token introspection endpoint?
5. Is the `authenticated-url` call server-to-server or browser-based?
6. What HTTP method and payload format are used?
7. How does IAM authenticate/authorize the callback to `authenticated-url`?
8. Is a `state` parameter supported?
9. Is a `nonce` required?
10. What is the token/session expiration time?
11. Is refresh-token functionality supported?
12. What is the IAM logout endpoint?
13. What error parameters are sent to `error-url`?
14. Can the same user authenticate against multiple applications?
15. What happens if the IAM service is unavailable?

These questions should be resolved as part of the IAM integration contract before implementation.
