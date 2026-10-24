# hactoberhacknova
# WorkKaro — Find Work. Hire Fast.

**WorkKaro** is a web-based platform prototype designed to connect daily-wage workers with employers who need people for short-term jobs. It aims to make finding work and hiring nearby workers simpler, faster and more accessible.

Built for **Hacktoberfest Hack Day — Build with Open-Source AI**.

## Problem Statement

Daily-wage workers often depend on personal contacts or informal networks to find work. At the same time, shopkeepers and other employers may struggle to find available workers for temporary or day-to-day tasks.

WorkKaro explores a digital solution where workers can discover nearby job opportunities and employers can connect with people looking for work.

## Our Solution

WorkKaro provides separate experiences for workers and employers. The worker-side prototype includes nearby job discovery, pay filtering, application management and location-based navigation.

The project combines a web interface with a local AI backend intended to support conversational assistance and wage-related queries.

## Key Features

- **Separate user roles:** Choose between the worker and employer experience.
- **Worker dashboard:** View job listings, application information, notifications and profile-related options.
- **Nearby job discovery:** Request device location and filter demo jobs by distance.
- **Search and filtering:** Search job listings and filter by minimum pay.
- **Sorting:** Sort opportunities by distance, pay or recency.
- **Application tracking:** Explore job applications and their statuses in the prototype.
- **Map and navigation:** View job locations and request route information.
- **Local AI assistance:** The backend is configured to use Ollama with Llama 3.2 for chat and wage-related endpoints.

## Technology Stack

### Frontend
- HTML5
- CSS3
- JavaScript
- Tailwind CSS via CDN

### Backend
- Node.js
- Native Node.js server implementation in `server.js`

### AI
- Ollama for local model execution
- Llama 3.2 as the model specified in the server setup

### Location and Maps
- Browser Geolocation API
- Leaflet for interactive map functionality
- OSRM for route information
- Google Maps for external directions

### Browser Storage
- `localStorage` for saving prototype state in the browser

## Project Structure

```text
hactoberhacknova/
├── src/
├── index.html
├── login.html
├── kaamkaro.html
├── worker-dashboard.html
├── workerverify.html
├── styles.css
├── worker.css
├── worker.js
├── server.js
├── LICENSE
└── README.md
```

- `index.html` — Landing page and role selection.
- `login.html` — Login interface.
- `kaamkaro.html` — Main WorkKaro application page.
- `worker-dashboard.html` — Worker dashboard interface.
- `workerverify.html` — Worker verification interface.
- `styles.css` — General page styling.
- `worker.css` — Worker dashboard styling.
- `worker.js` — Worker-side interactions, job filtering, location handling, applications and navigation.
- `server.js` — Local server and AI-related API endpoints.
- `src/` — Additional project source files.

## Running Locally

### Prerequisites

- Node.js 18 or newer
- Ollama installed and running
- The Llama 3.2 model downloaded through Ollama

### Setup

1. Clone the repository:

   ```bash
   git clone https://github.com/ananya21042008/hactoberhacknova.git
   ```

2. Open the project directory:

   ```bash
   cd hactoberhacknova
   ```

3. Download the model specified in the server setup:

   ```bash
   ollama pull llama3.2
   ```

4. Start the application server:

   ```bash
   node server.js
   ```

5. Open the following address in your browser:

   `http://localhost:3000/index.html`

6. Allow location access when testing features that depend on your current location.

The local AI features require Ollama to be running and the configured model to be available.

## Prototype Status and Limitations

WorkKaro is currently a prototype intended to demonstrate the proposed user experience and core interactions.

- Job listings, applications and earnings include demonstration data.
- Nearby job coordinates are generated for demonstration purposes.
- Browser-side storage is used for prototype state.
- Real-world deployment would require production data storage, verified employer and worker accounts, secure authentication, reliable job notifications and server-side validation of job locations.
- AI responses should be checked for accuracy before being used for important wage or employment decisions.
- Availability of map and routing services depends on external services and network connectivity.

## Open-Source AI and Development Tools

- **AI model:** Llama 3.2, configured through Ollama.
- **AI runtime:** Ollama.
- **Development environment:** Visual Studio Code and a terminal can be used to edit and run the project.
- **Other AI-assisted development tools:** Add the exact tools you actually used to research, generate, debug or improve the code.

The project uses AI-assisted functionality as part of its local backend design. The user interface and application logic are implemented with web technologies.

## Future Improvements

- Connect employers and workers through a persistent backend database.
- Implement secure authentication and worker verification.
- Enable real-time job notifications for suitable nearby workers.
- Allow employers to post jobs with accurate location, pay and work details.
- Add multilingual support for greater accessibility.
- Improve privacy, security and reliability before real-world deployment.

## License

This repository includes an MIT License. See the `LICENSE` file for the applicable terms.

## Project Repository

[WorkKaro on GitHub](https://github.com/ananya21042008/hactoberhacknova)
