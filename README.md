
#  DataVisa - Real-time data analysis & machine learning platform

![DataVisa Screenshot](https://github.com/Willie-Conway/DataVista-App/blob/62b22806b37009186f100531f50769ed98517397/assets/DataVista.png)

**DataVisa** is a sleek, interactive, browser-based application for data analysis, visualization, and machine learning. Built with modern web technologies, it enables users to run full data workflows—right from their browser! 🌐📊🧠

---

## ✨ Features

- 🔐 **User Authentication**: Sign up/log in with local storage persistence
- 📁 **Data Management**:
  - Upload CSV, XLSX, JSON files
  - Import datasets via URLs
  - Explore built-in sample datasets
- 🧹 **Data Processing**:
  - Clean missing data, duplicates, and outliers
  - Scale, encode, and reduce features
- 🧪 **Analysis Tools**:
  - Descriptive stats & summary tables
  - Hypothesis tests: T-test, Chi-square, ANOVA
  - Simulated ML models (classification/regression)
- 📈 **Visualization**:
  - Bar, Line, Scatter, Histogram, Pie charts
  - Interactive dashboards powered by Chart.js
- 👤 **User Customization**:
  - Dark 🌑 / Light 🌕 Mode
  - Editable profile and settings

---

## 🛠️ Technologies Used

- **Frontend**:  
  💻 HTML5, CSS3, JavaScript (ES6+), Tailwind CSS  
  🎨 [Font Awesome](https://fontawesome.com/) for icons  

- **Visualization**:  
  📊 [Chart.js](https://www.chartjs.org/)  
  🖼️ [QuickChart.io](https://quickchart.io/) placeholders

- **Storage**:  
  🗃️ Browser LocalStorage for persistence

---

## 📁 File Structure

```bash
data-visa/
├── index.html      # Main HTML file
├── style.css       # Custom styles
├── script.js       # JavaScript logic
└── README.md       # Project documentation

```

---

## ⚙️ Installation & Setup

1. **Clone this repository**:
   ```bash
   git clone https://github.com/your-username/data-visa.git
   cd data-visa
   ```

2. **Run in Browser**:
   Just open `index.html` in any modern browser (Chrome, Firefox, Edge). No server needed!

3. **Try Demo Credentials**:


 ```bash
Email: test@example.com  
Password: password123
 ```

---

## 📚 Usage Guide

### 📂 1. Data Loading

* Upload files or import from a URL
* Use built-in datasets (Iris, Titanic, etc.)
* View recent uploads

### 🧼 2. Data Cleaning

* Handle missing values (drop or impute)
* Remove duplicates
* Outlier detection
* View data health reports

### ⚙️ 3. Preprocessing

* Standardize / normalize features
* One-hot and label encoding
* Dimensionality reduction (PCA, t-SNE)

### 📊 4. Analysis

* View statistical summaries
* Run hypothesis tests
* Simulate ML models (Logistic Regression, Random Forest, etc.)

### 🖼️ 5. Visualization

* Create dynamic charts
* Customize axes and labels
* Export charts (coming soon!)

---

## 🎨 Customization

### 🌗 Themes

* Toggle dark/light mode in header or settings panel

### 🧪 Configuration

* Edit `script.js` to:

  * Add more datasets
  * Extend ML functionality
  * Adjust app behavior

---

## 🌐 Browser Support

| Browser | Support              |
| ------- | -------------------- |
| Chrome  | ✅ Full               |
| Firefox | ✅ Full               |
| Edge    | ✅ Full               |
| Safari  | ⚠️ Minor visual bugs |
| IE 11   | ❌ Not supported      |

---

## ⚠️ Limitations

* Client-side only (no server or database)
* LocalStorage limits (\~5MB)
* ML models are simulated (not real backend)

---

## 🔮 Future Enhancements

* Real-time database support (Firebase, etc.)
* Python/Flask ML backend
* Export options (PNG, PDF, CSV)
* Multi-user collaboration

---

## 📜 License

**MIT License** – See the `LICENSE` file for details.

---

## 👨🏿‍💻 Developer

**Willie Conway**
[GitHub Profile](https://github.com/Willie-Conway) • [LinkedIn](https://linkedin.com/in/willieconway)


