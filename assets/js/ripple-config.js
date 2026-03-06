// rippes configuration script
$(document).ready(function () {
    $('#ripple-bg').ripples({
        resolution: 512,
        dropRadius: 25, // Increased from 15 for larger ripples
        perturbance: 0.05, // Added to make ripples a bit deeper (default is 0.03)
        interactive: true
    })
});
