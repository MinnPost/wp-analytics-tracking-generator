<?php
/**
 * Class file for the WP_Analytics_Tracking_Generator_Settings class.
 *
 * @file
 */

if ( ! class_exists( 'WP_Analytics_Tracking_Generator' ) ) {
	die();
}

/**
 * Store some settings that are not exposed in the interface
 */
class WP_Analytics_Tracking_Generator_Settings {

	protected $option_prefix;
	protected $version;
	protected $slug;

	/**
	* Constructor which sets up admin pages
	*
	* @param string $option_prefix
	* @param string $version
	* @param string $slug
	* @throws \Exception
	*/
	public function __construct( $option_prefix, $version, $slug ) {

		$this->option_prefix = $option_prefix;
		$this->version       = $version;
		$this->slug          = $slug;

		$this->dimension_count_default = 20;
		$this->dimension_variables     = $this->get_dimension_variables();

	}

	/**
	* Types of analytics trackers, and what they support
	*
	* @param string $key
	* @return array $tracker_types
	*
	*/
	public function get_analytics_tracker_types( $key = '' ) {
		$tracker_types = array(
			'analyticsjs' => array(
				'name'     => 'analytics.js',
				'supports' => array(
					'plugins'    => true,
					'events'     => true,
					'dimensions' => true,
					'metrics'    => true,
				),
			),
			'gtagjs'      => array(
				'name'     => 'gtag.js',
				'supports' => array(
					'plugins'    => false,
					'events'     => true,
					'dimensions' => true,
					'metrics'    => true,
				),
			),
		);
		return $tracker_types;
	}

	/**
	* Variables we support for custom dimensions
	*
	* @param string $key
	* @return array $dimension_variables
	*
	*/
	public function get_dimension_variables( $key = '' ) {
		$dimension_variables = array(
			'author'     => array(
				'name'   => 'Author',
				'method' => 'get_the_author',
			),
			'categories' => array(
				'name'   => 'Categories',
				'method' => 'get_the_category',
			),
			'tags'       => array(
				'name'   => 'Tags',
				'method' => 'get_the_tags',
			),
			'post_id'    => array(
				'name'   => 'Post ID (if applicable)',
				'method' => 'get_the_ID',
			),
			'post_type'  => array(
				'name'   => 'Post Type (if applicable)',
				'method' => 'get_post_type',
			),
			'post_date'  => array(
				'name'   => 'Post Date (if applicable)',
				'method' => 'get_the_date',
			),
		);

		if ( '' !== $key ) {
			return $dimension_variables[ $key ];
		}
		return $dimension_variables;
	}

}
