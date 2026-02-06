define(['jquery'], function ($) {
    return {
        init: function () {
            console.log('Teacher Dashboard JS Initialized');

            // Use event delegation to ensure we catch the clicks
            $(document).on('click', '#dashboard-sidebar-nav .nav-link', function (e) {
                e.preventDefault();

                var targetId = $(this).data('target');
                console.log('Tab clicked:', targetId);

                if (targetId) {
                    // Update active state in sidebar
                    $('#dashboard-sidebar-nav .nav-link').removeClass('active');
                    $(this).addClass('active');

                    // Hide all sections first
                    $('.dashboard-section').addClass('d-none');

                    // Show target section
                    $('#' + targetId).removeClass('d-none');
                }
            });
        }
    };
});
